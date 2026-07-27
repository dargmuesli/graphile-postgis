import { sql } from "@dataplan/pg";
import type { GraphQLInterfaceType } from "graphql";
import type {
  GISTypeDetails,
  Subtype,
  TypeRegistry,
  InterfaceRegistry,
  PostGISResolvedData,
} from "./types.ts";
import {
  getGISTypeDetails,
  getGISTypeModifier,
  getGISTypeName,
} from "./utils.ts";
import { geoJsonToWkt } from "./geoJsonToWkt.ts";
import makeGeoJSONType from "./makeGeoJSONType.ts";
import { version } from "./version.ts";

declare global {
  namespace GraphileBuild {
    interface ScopeScalar {
      isGeoJSONType?: boolean;
    }
    interface ScopeInterface {
      isPgGISInterface?: boolean;
      isPgGISDimensionInterface?: boolean;
      pgGISTypeName?: string;
      pgGISZMFlag?: number;
    }
    interface Build {
      pgGISGraphQLTypesByTypeAndSubtype: TypeRegistry;
      pgGISGraphQLInterfaceTypesByType: InterfaceRegistry;
    }
  }
  namespace DataplanPg {
    interface PgCodecExtensions {
      // Set on the type-modifier-specific codecs created by
      // `pgCodecs_findModifiedPgCodec` below (e.g. for a `geometry(Point,4326)`
      // column), so schema build can map each one to its narrowed GraphQL type.
      postgisTypeDetails?: GISTypeDetails;
    }
  }
}

export const PostgisRegisterTypesPlugin: GraphileConfig.Plugin = {
  name: "PostgisRegisterTypesPlugin",
  version,

  gather: {
    hooks: {
      async pgCodecs_findPgCodec(_info, event) {
        if (event.pgCodec) return; // Another plugin already handled this
        const { pgType } = event;
        const typeName = pgType.typname;
        if (typeName === "geometry" || typeName === "geography") {
          const namespace = pgType.getNamespace();
          const schemaName = namespace?.nspname ?? "public";
          // Create a text-like scalar codec for PostGIS types
          event.pgCodec = {
            name: typeName,
            sqlType: sql.identifier(schemaName, typeName),
            fromPg: (value) => value,
            toPg: (value) => geoJsonToWkt(value),
            attributes: undefined,
            extensions: {
              pg: {
                name: typeName,
                schemaName,
                serviceName: "postgis",
              },
            },
            castFromPg: undefined,
            listCastFromPg: undefined,
            executor: null,
            isBinary: false,
            isEnum: false,
            hasNaturalOrdering: false,
            hasNaturalEquality: false,
          };
        }
      },

      async pgCodecs_findModifiedPgCodec(_info, event) {
        if (event.pgCodec) return; // Another plugin already handled this
        const { baseCodec, typeModifier } = event;
        if (baseCodec.name !== "geometry" && baseCodec.name !== "geography") {
          return;
        }
        const modifier =
          typeof typeModifier === "string"
            ? parseInt(typeModifier, 10)
            : typeModifier;
        if (!Number.isFinite(modifier) || modifier === -1) {
          // Unconstrained geometry/geography column; the base codec is fine.
          return;
        }
        let typeDetails: GISTypeDetails;
        try {
          typeDetails = getGISTypeDetails(modifier);
        } catch {
          // Modifier we don't understand; fall back to the base codec rather
          // than fail the whole introspection.
          return;
        }
        event.pgCodec = {
          ...baseCodec,
          name: `${baseCodec.name}_${modifier}`,
          baseCodec,
          extensions: {
            ...baseCodec.extensions,
            postgisTypeDetails: typeDetails,
          },
        };
      },
    },
  },

  schema: {
    hooks: {
      build(build) {
        const { pgGISGeometryCodec, pgGISGeographyCodec } = build;

        if (!pgGISGeometryCodec && !pgGISGeographyCodec) {
          return build;
        }

        const constructedTypes = build.pgGISGraphQLTypesByTypeAndSubtype;

        build.getPostgisTypeByGeometryType = function (
          codecName: string,
          subtype: Subtype,
          hasZ = false,
          hasM = false
        ) {
          const gisTypeKey = getGISTypeName(subtype, hasZ, hasM);
          return constructedTypes?.[codecName]?.[gisTypeKey];
        };

        build.pgGISIncludedTypes = [];
        build.pgGISIncludeType = function (typeName: string) {
          if (typeName) {
            build.pgGISIncludedTypes!.push(typeName);
          }
        };

        return build;
      },

      init(_, build, _context) {
        const {
          graphql: { GraphQLInt, GraphQLNonNull },
          inflection,
          pgGISGeographyCodec,
          pgGISGeometryCodec,
        } = build;

        if (!pgGISGeometryCodec && !pgGISGeographyCodec) {
          return _;
        }

        // Register GeoJSON scalar
        const geoJSONName = inflection.builtin("GeoJSON");
        build.registerScalarType(
          geoJSONName,
          { isGeoJSONType: true },
          () => makeGeoJSONType(build.graphql, geoJSONName),
          "Adding GeoJSON type from PostGIS plugin"
        );

        // GeoJSON is the input type for all geometry/geography codecs, modified
        // or not (see Phase 3 below for modified codecs' input mapping). The
        // base (unconstrained) codecs' output type is set once the base
        // interfaces have been registered, below.
        if (pgGISGeometryCodec) {
          build.setGraphQLTypeForPgCodec(
            pgGISGeometryCodec,
            "input",
            geoJSONName
          );
        }
        if (pgGISGeographyCodec) {
          build.setGraphQLTypeForPgCodec(
            pgGISGeographyCodec,
            "input",
            geoJSONName
          );
        }

        const geojsonFieldName = inflection.geojsonFieldName();
        const constructedTypes = build.pgGISGraphQLTypesByTypeAndSubtype;
        const _interfaces = build.pgGISGraphQLInterfaceTypesByType;

        // Helper to get or create top-level interface name (registers during init)
        function ensureGisInterface(codecName: string): string {
          const zmflag = -1;
          if (!_interfaces[codecName]) {
            _interfaces[codecName] = {};
          }
          if (!_interfaces[codecName][zmflag]) {
            const interfaceName = inflection.gisInterfaceName({
              typeName: codecName,
            });
            build.registerInterfaceType(
              interfaceName,
              {
                isPgGISInterface: true,
                pgGISTypeName: codecName,
                pgGISZMFlag: zmflag,
              },
              () => ({
                fields: () => ({
                  ...(build.getTypeByName(geoJSONName)
                    ? {
                        [geojsonFieldName]: {
                          type: build.getTypeByName(geoJSONName),
                          description: "Converts the object to GeoJSON",
                        },
                      }
                    : {}),
                  srid: {
                    type: new GraphQLNonNull(GraphQLInt),
                    description: "Spatial reference identifier (SRID)",
                  },
                }),
                resolveType(value: PostGISResolvedData) {
                  const Type = constructedTypes[codecName]?.[value.__gisType];
                  return Type;
                },
                description: `All ${codecName} types implement this interface`,
              }),
              `PostGIS ${codecName} interface`
            );
            _interfaces[codecName][zmflag] = interfaceName;
          }
          return _interfaces[codecName][zmflag];
        }

        // Helper to get or create dimension interface name (registers during init)
        function ensureGisDimensionInterface(
          codecName: string,
          hasZ: boolean,
          hasM: boolean
        ): string {
          const zmflag = (hasZ ? 2 : 0) + (hasM ? 1 : 0);
          if (!_interfaces[codecName]) {
            _interfaces[codecName] = {};
          }
          if (!_interfaces[codecName][zmflag]) {
            const interfaceName = inflection.gisDimensionInterfaceName({
              typeName: codecName,
              hasZ,
              hasM,
            });
            build.registerInterfaceType(
              interfaceName,
              {
                isPgGISDimensionInterface: true,
                pgGISTypeName: codecName,
                pgGISZMFlag: zmflag,
              },
              () => ({
                fields: () => ({
                  ...(build.getTypeByName(geoJSONName)
                    ? {
                        [geojsonFieldName]: {
                          type: build.getTypeByName(geoJSONName),
                          description: "Converts the object to GeoJSON",
                        },
                      }
                    : {}),
                  srid: {
                    type: new GraphQLNonNull(GraphQLInt),
                    description: "Spatial reference identifier (SRID)",
                  },
                }),
                resolveType(value: PostGISResolvedData) {
                  const Type = constructedTypes[codecName]?.[value.__gisType];
                  return Type;
                },
                description: `All ${codecName} ${
                  { 0: "XY", 1: "XYM", 2: "XYZ", 3: "XYZM" }[zmflag]
                } types implement this interface`,
              }),
              `PostGIS ${codecName} dimension interface (zmflag=${zmflag})`
            );
            _interfaces[codecName][zmflag] = interfaceName;
          }
          return _interfaces[codecName][zmflag];
        }

        // Phase 1: Register ALL interfaces first (must happen during init)
        for (const codecName of ["geometry", "geography"]) {
          // Top-level interface (e.g., GeometryInterface, GeographyInterface)
          ensureGisInterface(codecName);

          // Dimension interfaces for all Z/M combinations
          for (const hasZ of [false, true]) {
            for (const hasM of [false, true]) {
              ensureGisDimensionInterface(codecName, hasZ, hasM);
            }
          }
        }

        // The base (unconstrained) codecs output their top-level interface
        // (e.g. `GeometryInterface`) - a column/argument/return value only
        // gets narrowed to a concrete type like `GeometryPoint` once its
        // codec carries a type modifier (see Phase 3 below).
        if (pgGISGeometryCodec) {
          const interfaceTypeName = _interfaces.geometry?.[-1];
          if (interfaceTypeName) {
            build.setGraphQLTypeForPgCodec(
              pgGISGeometryCodec,
              "output",
              interfaceTypeName
            );
          }
        }
        if (pgGISGeographyCodec) {
          const interfaceTypeName = _interfaces.geography?.[-1];
          if (interfaceTypeName) {
            build.setGraphQLTypeForPgCodec(
              pgGISGeographyCodec,
              "output",
              interfaceTypeName
            );
          }
        }

        // Phase 2: Register ALL object types (must happen during init)
        const subtypes: Array<Subtype> = [1, 2, 3, 4, 5, 6, 7];
        for (const codecName of ["geometry", "geography"]) {
          if (!constructedTypes[codecName]) {
            constructedTypes[codecName] = {};
          }
          for (const subtype of subtypes) {
            for (const hasZ of [false, true]) {
              for (const hasM of [false, true]) {
                const typeModifier = getGISTypeModifier(subtype, hasZ, hasM, 0);
                const typeDetails = getGISTypeDetails(typeModifier);
                const gisTypeKey = getGISTypeName(
                  typeDetails.subtype,
                  typeDetails.hasZ,
                  typeDetails.hasM
                );

                if (!constructedTypes[codecName][gisTypeKey]) {
                  const typeName = inflection.gisType({
                    typeName: codecName,
                    subtype,
                    hasZ,
                    hasM,
                  });

                  build.registerObjectType(
                    typeName,
                    {
                      isPgGISType: true,
                      pgGISTypeName: codecName,
                      pgGISTypeDetails: typeDetails,
                    },
                    () => ({
                      interfaces: () => {
                        const interfaceTypeName = _interfaces[codecName]?.[-1];
                        const dimZmflag = (hasZ ? 2 : 0) + (hasM ? 1 : 0);
                        const dimInterfaceTypeName =
                          _interfaces[codecName]?.[dimZmflag];
                        const ifaces: GraphQLInterfaceType[] = [];
                        if (interfaceTypeName) {
                          const iface = build.getTypeByName(interfaceTypeName);
                          if (iface) ifaces.push(iface as GraphQLInterfaceType);
                        }
                        if (dimInterfaceTypeName) {
                          const iface =
                            build.getTypeByName(dimInterfaceTypeName);
                          if (iface) ifaces.push(iface as GraphQLInterfaceType);
                        }
                        return ifaces;
                      },
                      fields: () => ({
                        ...(build.getTypeByName(geoJSONName)
                          ? {
                              [geojsonFieldName]: {
                                type: build.getTypeByName(geoJSONName),
                                resolve(data: PostGISResolvedData) {
                                  return data.__geojson;
                                },
                              },
                            }
                          : {}),
                        srid: {
                          type: new GraphQLNonNull(GraphQLInt),
                          resolve(data: PostGISResolvedData) {
                            return data.__srid;
                          },
                        },
                      }),
                    }),
                    `PostGIS ${codecName} type ${gisTypeKey}`
                  );
                  constructedTypes[codecName][gisTypeKey] = typeName;
                }
              }
            }
          }

          // Also store dimension interface names as the "subtype 0" entries
          for (const hasZ of [false, true]) {
            for (const hasM of [false, true]) {
              const gisTypeKey = getGISTypeName(0, hasZ, hasM);
              if (!constructedTypes[codecName][gisTypeKey]) {
                constructedTypes[codecName][gisTypeKey] =
                  ensureGisDimensionInterface(codecName, hasZ, hasM);
              }
            }
          }
        }

        // Phase 3: Map every type-modifier-specific codec (e.g. the codec
        // backing a `geometry(Point,4326)` column, function argument, or
        // return type - see `pgCodecs_findModifiedPgCodec` above) to its
        // narrowed GraphQL output type. Because this operates at the codec
        // level rather than per-attribute, it covers columns, composite
        // attributes, and function parameters/returns uniformly.
        for (const codec of Object.values(build.pgCodecs ?? {})) {
          const baseCodec = codec.baseCodec;
          if (!baseCodec) continue;
          const codecName =
            baseCodec === pgGISGeometryCodec
              ? "geometry"
              : baseCodec === pgGISGeographyCodec
                ? "geography"
                : null;
          const typeDetails = codec.extensions?.postgisTypeDetails;
          if (!codecName || !typeDetails) continue;

          const gisTypeKey = getGISTypeName(
            typeDetails.subtype,
            typeDetails.hasZ,
            typeDetails.hasM
          );
          const typeName = constructedTypes[codecName]?.[gisTypeKey];
          if (typeName && !build.hasGraphQLTypeForPgCodec(codec, "output")) {
            build.setGraphQLTypeForPgCodec(codec, ["output"], typeName);
          }
          if (!build.hasGraphQLTypeForPgCodec(codec, "input")) {
            build.setGraphQLTypeForPgCodec(codec, ["input"], geoJSONName);
          }
        }

        return _;
      },

      // Ensure all PostGIS types are included in the schema
      GraphQLSchema(schema, build) {
        if (!build.pgGISGeometryCodec && !build.pgGISGeographyCodec) {
          return schema;
        }
        const types = [...(schema.types || [])];
        for (const typeName of build.pgGISIncludedTypes) {
          const type = build.getTypeByName(typeName);
          if (type) {
            types.push(type);
          }
        }
        return { ...schema, types };
      },
    },
  },
};

export default PostgisRegisterTypesPlugin;
