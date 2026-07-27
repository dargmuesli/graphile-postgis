import {
  pgClassExpression,
  sql,
  TYPES,
  type PgClassSingleStep,
  type PgCodecWithAttributes,
  type PgSelectSingleStep,
} from "@dataplan/pg";
import type { PostGISResolvedData } from "./types.ts";
import { version } from "./version.ts";

/**
 * This plugin overrides the plan for columns that use PostGIS geometry/
 * geography types, wrapping the SQL expression to extract GIS metadata
 * (type name, SRID, GeoJSON). The GraphQL output type itself (generic
 * interface vs. a narrowed type like `GeometryPoint`) is determined by
 * PostgisRegisterTypesPlugin at the codec level, via `pgCodecs_findModifiedPgCodec`
 * / `setGraphQLTypeForPgCodec`, so it doesn't need to be computed here.
 */
export const PostgisColumnsPlugin: GraphileConfig.Plugin = {
  name: "PostgisColumnsPlugin",
  version,
  after: [
    "PostgisExtensionDetectionPlugin",
    "PostgisRegisterTypesPlugin",
    "PgAttributesPlugin",
  ],

  schema: {
    hooks: {
      GraphQLObjectType_fields(fields, build, context) {
        const {
          scope: { pgCodec },
        } = context;
        if (!pgCodec) return fields;
        const codec = pgCodec as PgCodecWithAttributes;
        if (!codec.attributes) return fields;

        const {
          pgGISGeometryCodec,
          pgGISGeographyCodec,
          pgGISExtensionSchema,
          inflection,
          EXPORTABLE,
        } = build;

        if (!pgGISGeometryCodec && !pgGISGeographyCodec) {
          return fields;
        }

        const extensionSchema = pgGISExtensionSchema || "public";

        const modifiedFields: typeof fields = {};

        for (const [attributeName, attribute] of Object.entries(
          codec.attributes
        )) {
          const attrCodec = attribute.codec;
          const attrBaseCodec = attrCodec.baseCodec ?? attrCodec;
          if (
            attrBaseCodec.name !== "geometry" &&
            attrBaseCodec.name !== "geography"
          ) {
            continue;
          }

          const fieldName = inflection.attribute({
            attributeName,
            codec,
          });

          const existingField = fields[fieldName];
          if (!existingField) {
            continue;
          }

          modifiedFields[fieldName] = {
            ...existingField,
            resolve(data: PostGISResolvedData) {
              return data;
            },
            plan: EXPORTABLE(
              (TYPES, attributeName, extensionSchema, pgClassExpression, sql) =>
                ($record: PgClassSingleStep) => {
                  const buildExpression = (
                    col: ReturnType<typeof sql.identifier>
                  ) => {
                    const extSchema = sql.identifier(extensionSchema);
                    return sql`(case when ${col} is null then null else json_build_object(
                        '__gisType', ${extSchema}.postgis_type_name(
                          ${extSchema}.geometrytype(${col}),
                          ${extSchema}.st_coorddim(${col}::text)
                        ),
                        '__srid', ${extSchema}.st_srid(${col}),
                        '__geojson', ${extSchema}.st_asgeojson(${col})::json
                      ) end)`;
                  };

                  // PgSelectSingleStep (queries) exposes `.select()`, which
                  // handles referencing the row correctly (joins, subquery
                  // aliasing, etc.) via its internal scoped-SQL machinery.
                  if ("select" in $record) {
                    return ($record as PgSelectSingleStep).select(
                      () => buildExpression(sql.identifier(attributeName)),
                      TYPES.json
                    );
                  }

                  // PgInsertSingleStep / PgUpdateSingleStep / PgDeleteSingleStep
                  // (mutations) have no `.select()`; reference the row's own
                  // alias directly instead, same as their own `.get()` does
                  // for plain (untransformed) attributes.
                  const col = sql`${$record.alias}.${sql.identifier(attributeName)}`;
                  const sqlExpr = pgClassExpression($record, TYPES.json);
                  return sqlExpr`${buildExpression(col)}`;
                },
              [TYPES, attributeName, extensionSchema, pgClassExpression, sql]
            ),
          };
        }

        if (Object.keys(modifiedFields).length > 0) {
          return { ...fields, ...modifiedFields };
        }

        return fields;
      },
    },
  },
};

export default PostgisColumnsPlugin;
