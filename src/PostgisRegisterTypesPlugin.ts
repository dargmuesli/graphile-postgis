import type { PgCodec, PgCodecWithAttributes } from "postgraphile/@dataplan/pg";
import type { SQL } from "postgraphile/@dataplan/pg/pg-sql2";
import type { Step } from "postgraphile/grafast";
import type {
  Subtype,
  TypeRegistry,
  InterfaceRegistry,
  PostGISResolvedData,
} from "./types.ts";
import debug from "./debug.ts";
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
      postgisTypeModifier?: number;
    }
  }
}

export const PostgisRegisterTypesPlugin: GraphileConfig.Plugin = {
  name: "PostgisRegisterTypesPlugin",
  version,

  gather: {
    hooks: {
      async pgCodecs_findPgCodec(info, event) {
        if (event.pgCodec) return; // Another plugin already handled this
        const { pgType, serviceName } = event;
        const typeName = pgType.typname;
        if (typeName === "geometry" || typeName === "geography") {
          const { sql } = info.lib.dataplanPg;
          const namespace = pgType.getNamespace();
          const schemaName = namespace?.nspname ?? "public";
          const extSchema = sql.identifier(schemaName);
          const tags = pgType.getTags();

          // Wraps the raw column reference to extract GIS metadata (type
          // name, SRID, GeoJSON) as JSON text; `fromPg` below parses it back
          // out. This is the same castFromPg/fromPg pairing dataplan-pg uses
          // for its own date and range codecs, and it lets the framework's
          // default attribute plan decode the value without us overriding it.
          const castFromPg = (frag: SQL) =>
            sql`(case when ${frag} is null then null else json_build_object(
                '__gisType', ${extSchema}.postgis_type_name(
                  ${extSchema}.geometrytype(${frag}),
                  ${extSchema}.st_coorddim((${frag})::text)
                ),
                '__srid', ${extSchema}.st_srid(${frag}),
                '__geojson', ${extSchema}.st_asgeojson(${frag})::json
              ) end)::text`;

          // Create a text-like scalar codec for PostGIS types
          event.pgCodec = {
            name: typeName,
            sqlType: sql.identifier(schemaName, typeName),
            castFromPg,
            fromPg: (value) => JSON.parse(value),
            toPg: (value) => geoJsonToWkt(value),
            attributes: undefined,
            extensions: {
              pg: {
                name: typeName,
                schemaName,
                serviceName,
              },
              ...(Object.keys(tags).length > 0 ? { tags } : null),
            },
            listCastFromPg: undefined,
            executor: null,
            isBinary: false,
            isEnum: false,
            hasNaturalOrdering: false,
            hasNaturalEquality: false,
          };
        }
      },

      async pgCodecs_findModifiedPgCodec(info, event) {
        const { baseCodec, typeModifier } = event;
        if (baseCodec.name !== "geometry" && baseCodec.name !== "geography") {
          return;
        }
        const numericModifier =
          typeof typeModifier === "string"
            ? parseInt(typeModifier, 10)
            : typeModifier;
        if (numericModifier === -1) {
          return;
        }
        const { srid } = getGISTypeDetails(numericModifier);
        // Register a codec for this specific type modifier (shared by every
        // column that uses it) so its PostGIS GraphQL output type can be set
        // directly on the codec below, instead of generating a generic field
        // and overriding it afterwards.
        event.pgCodec = {
          ...baseCodec,
          name: info.inflection.pgGISModifiedCodecName({
            baseCodecName: baseCodec.name,
            typeModifier: numericModifier,
          }),
          baseCodec,
          // A typmod SRID of 0 means the column doesn't constrain the SRID,
          // so GeoJSON input still falls back to the RFC 7946 default below.
          toPg: (value) => geoJsonToWkt(value, srid || 4326),
          extensions: {
            ...baseCodec.extensions,
            postgisTypeModifier: numericModifier,
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

        return build.extend(
          build,
          {
            getPostgisTypeNameByGeometryType(
              codecName: string,
              subtype: Subtype,
              hasZ = false,
              hasM = false
            ) {
              const gisTypeKey = getGISTypeName(subtype, hasZ, hasM);
              return constructedTypes?.[codecName]?.[gisTypeKey];
            },
            pgGISImplementationsByInterface: new Map<string, string[]>(),
          },
          "PostGIS type registration"
        );
      },

      init(_, build, _context) {
        const {
          grafast: { access, lambda },
          graphql: { GraphQLInt, GraphQLNonNull, assertInterfaceType },
          inflection,
          pgGISGeographyCodec,
          pgGISGeometryCodec,
          pgGISImplementationsByInterface: implementationsByInterface,
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

        // Writing a geometry/geography column is always done via GeoJSON,
        // regardless of which specific shape the column is constrained to.
        if (pgGISGeometryCodec) {
          build.setGraphQLTypeForPgCodec(
            pgGISGeometryCodec,
            ["input"],
            geoJSONName
          );
        }
        if (pgGISGeographyCodec) {
          build.setGraphQLTypeForPgCodec(
            pgGISGeographyCodec,
            ["input"],
            geoJSONName
          );
        }

        const geojsonFieldName = inflection.geojsonFieldName();
        const constructedTypes = build.pgGISGraphQLTypesByTypeAndSubtype;
        const _interfaces = build.pgGISGraphQLInterfaceTypesByType;
        const codecs = {
          geometry: pgGISGeometryCodec,
          geography: pgGISGeographyCodec,
        };
        const codecNames = ["geometry", "geography"] as const;
        const planGISType = {
          geometry: makePlanGISType("geometry"),
          geography: makePlanGISType("geography"),
        };

        function makePlanGISType(codecName: string) {
          function getTypeName(data: PostGISResolvedData) {
            return constructedTypes[codecName]?.[data.__gisType] ?? null;
          }
          return ($data: Step<PostGISResolvedData>) => ({
            $__typename: lambda($data, getTypeName),
            planForType: () => $data,
          });
        }

        // Helper to get or create top-level interface name (registers during init)
        function ensureGisInterface(
          codecName: (typeof codecNames)[number]
        ): string {
          const zmflag = -1;
          if (!_interfaces[codecName]) {
            _interfaces[codecName] = {};
          }
          if (!_interfaces[codecName][zmflag]) {
            const interfaceName = inflection.gisInterfaceName({
              typeName: codecName,
              codec: codecs[codecName] ?? undefined,
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
                planType: planGISType[codecName],
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
          codecName: (typeof codecNames)[number],
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
              codec: codecs[codecName] ?? undefined,
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
                planType: planGISType[codecName],
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
        for (const codecName of codecNames) {
          // Top-level interface (e.g., GeometryInterface, GeographyInterface)
          ensureGisInterface(codecName);

          // Dimension interfaces for all Z/M combinations
          for (const hasZ of [false, true]) {
            for (const hasM of [false, true]) {
              ensureGisDimensionInterface(codecName, hasZ, hasM);
            }
          }
        }

        // Columns with no type modifier (a bare `geometry`/`geography`
        // column, or a value from a custom SQL expression) can hold any
        // shape, so they output through the top-level interface.
        if (pgGISGeometryCodec) {
          build.setGraphQLTypeForPgCodec(
            pgGISGeometryCodec,
            ["output"],
            ensureGisInterface("geometry")
          );
        }
        if (pgGISGeographyCodec) {
          build.setGraphQLTypeForPgCodec(
            pgGISGeographyCodec,
            ["output"],
            ensureGisInterface("geography")
          );
        }

        // Phase 2: Register ALL object types (must happen during init)
        const subtypes: Array<Subtype> = [1, 2, 3, 4, 5, 6, 7];
        for (const codecName of codecNames) {
          const codec = codecs[codecName] ?? undefined;
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
                    codec,
                    subtype,
                    hasZ,
                    hasM,
                  });
                  const zmflag = (hasZ ? 2 : 0) + (hasM ? 1 : 0);
                  const interfaceNames = [
                    _interfaces[codecName]?.[-1],
                    _interfaces[codecName]?.[zmflag],
                  ].filter((name) => name != null);

                  build.registerObjectType(
                    typeName,
                    {
                      pgGISType: { typeName: codecName, codec, ...typeDetails },
                    },
                    () => ({
                      interfaces: () =>
                        interfaceNames.map((name) =>
                          assertInterfaceType(build.getTypeByName(name))
                        ),
                      fields: () => ({
                        ...(build.getTypeByName(geoJSONName)
                          ? {
                              [geojsonFieldName]: {
                                type: build.getTypeByName(geoJSONName),
                                plan($data: Step<PostGISResolvedData>) {
                                  return access($data, ["__geojson"]);
                                },
                              },
                            }
                          : {}),
                        srid: {
                          type: new GraphQLNonNull(GraphQLInt),
                          plan($data: Step<PostGISResolvedData>) {
                            return access($data, ["__srid"]);
                          },
                        },
                      }),
                    }),
                    `PostGIS ${codecName} type ${gisTypeKey}`
                  );
                  constructedTypes[codecName][gisTypeKey] = typeName;
                  for (const interfaceName of interfaceNames) {
                    const implementations =
                      implementationsByInterface.get(interfaceName);
                    if (implementations) {
                      implementations.push(typeName);
                    } else {
                      implementationsByInterface.set(interfaceName, [typeName]);
                    }
                  }
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

        // Phase 3: Now that every specific type/interface name is known,
        // register the correct output type directly on each column's own
        // codec (registered per type modifier in the
        // `pgCodecs_findModifiedPgCodec` gather hook above). This means the
        // framework's default attribute plan already produces a
        // correctly-typed field, so no plugin needs to generate a field and
        // then overwrite it.
        const seenCodecs = new Set<PgCodec>();
        for (const resource of Object.values(build.pgResources)) {
          const resourceCodec = resource.codec as PgCodecWithAttributes;
          if (!resourceCodec.attributes) continue;

          for (const attribute of Object.values(resourceCodec.attributes)) {
            const attrCodec = attribute.codec;
            const typeModifier = attrCodec.extensions?.postgisTypeModifier;
            if (typeModifier == null || seenCodecs.has(attrCodec)) continue;
            seenCodecs.add(attrCodec);

            const codecName = attrCodec.baseCodec?.name;
            if (!codecName) continue;
            const typeDetails = getGISTypeDetails(typeModifier);
            const gisTypeKey = getGISTypeName(
              typeDetails.subtype,
              typeDetails.hasZ,
              typeDetails.hasM
            );
            const typeName = constructedTypes[codecName]?.[gisTypeKey];
            if (!typeName) {
              debug(
                `Unexpectedly couldn't find a type for ${codecName} ${gisTypeKey}`
              );
              continue;
            }

            build.setGraphQLTypeForPgCodec(attrCodec, ["input"], geoJSONName);
            build.setGraphQLTypeForPgCodec(attrCodec, ["output"], typeName);
          }
        }

        return _;
      },

      GraphQLSchema_types: {
        after: ["CollectReferencedTypesPlugin"],
        callback(types, build) {
          if (!build.pgGISGeometryCodec && !build.pgGISGeographyCodec) {
            return types;
          }

          const includedTypes = new Set<string>();
          for (const type of types) {
            const implementations = build.pgGISImplementationsByInterface.get(
              type.name
            );
            if (!implementations) continue;
            for (const typeName of implementations) {
              includedTypes.add(typeName);
            }
          }
          const result = new Set(types);
          for (const typeName of includedTypes) {
            const type = build.getTypeByName(typeName);
            if (type) result.add(type);
          }
          return [...result];
        },
      },
    },
  },
};

export default PostgisRegisterTypesPlugin;
