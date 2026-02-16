import type { PgCodecWithAttributes } from "@dataplan/pg";
import { getGISTypeDetails, getGISTypeName } from "./utils";
import { version } from "../package.json";

/**
 * This plugin overrides the GraphQL output type and plan for columns
 * that use PostGIS geometry/geography types. It wraps the SQL expression
 * to extract GIS metadata (type name, SRID, GeoJSON) and maps the column
 * to the appropriate PostGIS GraphQL type or interface.
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
          pgGISGraphQLTypesByTypeAndSubtype: constructedTypes,
          pgGISGraphQLInterfaceTypesByType: _interfaces,
          inflection,
          sql,
          graphql: { GraphQLNonNull },
          EXPORTABLE,
        } = build;

        if (!pgGISGeometryCodec || !pgGISGeographyCodec) {
          return fields;
        }

        const extensionSchema = pgGISExtensionSchema || "public";

        const modifiedFields: typeof fields = {};

        for (const [attributeName, attribute] of Object.entries(
          codec.attributes
        )) {
          const attrCodec = attribute.codec;
          if (attrCodec.name !== "geometry" && attrCodec.name !== "geography") {
            continue;
          }

          const codecName = attrCodec.name;
          const typeModifier =
            (attribute.extensions as any)?.postgisTypeModifier ?? -1;

          let gisTypeName: string | null = null;

          if (typeModifier !== -1) {
            const typeDetails = getGISTypeDetails(typeModifier);
            const { subtype, hasZ, hasM } = typeDetails;
            const gisTypeKey = getGISTypeName(subtype, hasZ, hasM);
            gisTypeName = constructedTypes[codecName]?.[gisTypeKey] ?? null;
          }

          // Fall back to the base interface if no specific modifier
          if (!gisTypeName) {
            gisTypeName = _interfaces[codecName]?.[-1] ?? null;
          }

          if (!gisTypeName) {
            continue;
          }

          const gqlType = build.getTypeByName(gisTypeName);
          if (!gqlType) {
            continue;
          }

          const fieldName = inflection.attribute({
            attributeName,
            codec,
          });

          if (!fields[fieldName]) {
            continue;
          }

          const existingField = fields[fieldName];
          const isNotNull = attribute.notNull;

          modifiedFields[fieldName] = {
            ...existingField,
            type: isNotNull ? new GraphQLNonNull(gqlType) : (gqlType as any),
            resolve(data: any) {
              return data[attributeName];
            },
            plan: EXPORTABLE(
              (attributeName, extensionSchema, sql) => ($record: any) => {
                const colExpr = sql`${$record.getClassStep().alias}.${sql.identifier(attributeName)}`;

                const wrappedExpr = sql`(case when ${colExpr} is null then null else json_build_object(
                      '__gisType', ${sql.identifier(extensionSchema, "postgis_type_name")}(
                        ${sql.identifier(extensionSchema, "geometrytype")}(${colExpr}),
                        ${sql.identifier(extensionSchema, "st_coorddim")}(${colExpr}::text)
                      ),
                      '__srid', ${sql.identifier(extensionSchema, "st_srid")}(${colExpr}),
                      '__geojson', ${sql.identifier(extensionSchema, "st_asgeojson")}(${colExpr})::json
                    ) end)`;

                return $record.selectExpression(wrappedExpr);
              },
              [attributeName, extensionSchema, sql]
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
