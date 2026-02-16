import { sql } from "@dataplan/pg";

import { GISTypeDetails, Subtype } from ".";
import { getGISTypeDetails, getGISTypeModifier, getGISTypeName } from "./utils";
import makeGeoJSONType from "./makeGeoJSONType";
import { version } from "../package.json";

declare global {
  namespace GraphileBuild {
    interface ScopeScalar {
      isGeoJSONType?: boolean;
    }
    interface ScopeObject {
      isPgGISType?: boolean;
      pgGISTypeName?: string;
      pgGISTypeDetails?: GISTypeDetails;
    }
    interface ScopeInterface {
      isPgGISInterface?: boolean;
      isPgGISDimensionInterface?: boolean;
      pgGISTypeName?: string;
      pgGISZMFlag?: number;
    }
    interface Build {
      getPostgisTypeByGeometryType(
        codecName: string,
        subtype: Subtype,
        hasZ?: boolean,
        hasM?: boolean,
        srid?: number
      ): any;
      pgGISIncludedTypes: any[];
      pgGISIncludeType(Type: any): void;
    }
  }
  namespace DataplanPg {
    interface PgCodecAttributeExtensions {
      postgisTypeModifier?: number;
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
            fromPg: (value: any) => value,
            toPg: (value: any) => value,
            attributes: undefined,
            extensions: {
              pg: {
                schemaName,
                typeName,
              },
            },
            castFromPg: undefined,
            listCastFromPg: undefined,
            executor: null,
            isBinary: false,
            isEnum: false,
            hasNaturalOrdering: false,
            hasNaturalEquality: false,
          } as any;
        }
      },

      async pgCodecs_attribute(_info, event) {
        const { pgAttribute, attribute } = event;
        if (
          attribute.codec &&
          (attribute.codec.name === "geometry" ||
            attribute.codec.name === "geography") &&
          pgAttribute.atttypmod != null &&
          pgAttribute.atttypmod !== -1
        ) {
          if (!attribute.extensions) {
            attribute.extensions = { tags: {} };
          }
          attribute.extensions.postgisTypeModifier = pgAttribute.atttypmod;
        }
      },
    },
  },

  schema: {
    hooks: {
      build(build) {
        const { pgGISGeometryCodec, pgGISGeographyCodec } = build;

        if (!pgGISGeometryCodec || !pgGISGeographyCodec) {
          return build;
        }

        const constructedTypes = build.pgGISGraphQLTypesByTypeAndSubtype;

        build.getPostgisTypeByGeometryType = function (
          codecName: string,
          subtype: Subtype,
          hasZ: boolean = false,
          hasM: boolean = false
        ) {
          const gisTypeKey = getGISTypeName(subtype, hasZ, hasM);
          return constructedTypes?.[codecName]?.[gisTypeKey];
        };

        build.pgGISIncludedTypes = [];
        build.pgGISIncludeType = function (Type: any) {
          if (Type) {
            build.pgGISIncludedTypes!.push(Type);
          }
        };

        return build;
      },

      init(_, build, _context) {
        const {
          graphql: { GraphQLInt, GraphQLNonNull },
          inflection,
          pgGISGeometryCodec,
          pgGISGeographyCodec,
        } = build;

        if (!pgGISGeometryCodec || !pgGISGeographyCodec) {
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

        // Map geometry and geography codecs to GeoJSON type
        // This makes PostGIS columns appear in the schema with the GeoJSON type
        // as a fallback; specific output types are overridden per-field by PostgisColumnsPlugin
        build.setGraphQLTypeForPgCodec(
          pgGISGeometryCodec,
          ["input", "output"],
          geoJSONName
        );
        build.setGraphQLTypeForPgCodec(
          pgGISGeographyCodec,
          ["input", "output"],
          geoJSONName
        );

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
                  [geojsonFieldName]: {
                    type: build.getTypeByName(geoJSONName) as any,
                    description: "Converts the object to GeoJSON",
                  },
                  srid: {
                    type: new GraphQLNonNull(GraphQLInt),
                    description: "Spatial reference identifier (SRID)",
                  },
                }),
                resolveType(value: any) {
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
                  [geojsonFieldName]: {
                    type: build.getTypeByName(geoJSONName) as any,
                    description: "Converts the object to GeoJSON",
                  },
                  srid: {
                    type: new GraphQLNonNull(GraphQLInt),
                    description: "Spatial reference identifier (SRID)",
                  },
                }),
                resolveType(value: any) {
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
                      pgGISTypeDetails: {
                        subtype,
                        hasZ,
                        hasM,
                        srid: typeDetails.srid,
                      },
                    },
                    () => ({
                      interfaces: () => {
                        const interfaceTypeName = _interfaces[codecName]?.[-1];
                        const dimZmflag = (hasZ ? 2 : 0) + (hasM ? 1 : 0);
                        const dimInterfaceTypeName =
                          _interfaces[codecName]?.[dimZmflag];
                        const ifaces: any[] = [];
                        if (interfaceTypeName) {
                          const iface = build.getTypeByName(interfaceTypeName);
                          if (iface) ifaces.push(iface);
                        }
                        if (dimInterfaceTypeName) {
                          const iface =
                            build.getTypeByName(dimInterfaceTypeName);
                          if (iface) ifaces.push(iface);
                        }
                        return ifaces;
                      },
                      fields: () => ({
                        [geojsonFieldName]: {
                          type: build.getTypeByName(geoJSONName) as any,
                          resolve(data: any) {
                            return data.__geojson;
                          },
                          plan($parent: any) {
                            return $parent.get("__geojson");
                          },
                        },
                        srid: {
                          type: new GraphQLNonNull(GraphQLInt),
                          resolve(data: any) {
                            return data.__srid;
                          },
                          plan($parent: any) {
                            return $parent.get("__srid");
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

        return _;
      },

      // Ensure all PostGIS types are included in the schema
      GraphQLSchema(schema, build) {
        if (!build.pgGISGeometryCodec || !build.pgGISGeographyCodec) {
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
