import type { Step } from "postgraphile/grafast";
import type { PostGISResolvedData } from "./types.ts";
import { GIS_SUBTYPE } from "./constants.ts";
import { getGISTypeName } from "./utils.ts";
import { version } from "./version.ts";

export const Postgis_MultiLineString_LineStringsPlugin: GraphileConfig.Plugin =
  {
    name: "Postgis_MultiLineString_LineStringsPlugin",
    description: "Enhancing the `MultiLineString` type",
    version,

    schema: {
      hooks: {
        GraphQLObjectType_fields(fields, build, context) {
          const { pgGISType } = context.scope;
          if (pgGISType?.subtype !== GIS_SUBTYPE.MultiLineString) {
            return fields;
          }
          const {
            extend,
            getPostgisTypeNameByGeometryType,
            grafast: { lambda },
            graphql: { GraphQLList },
          } = build;
          const { hasZ, hasM, srid } = pgGISType;
          const typeName = getPostgisTypeNameByGeometryType(
            pgGISType.typeName,
            GIS_SUBTYPE.LineString,
            hasZ,
            hasM,
            srid
          );
          const LineString = typeName ? build.getTypeByName(typeName) : null;
          if (!build.graphql.isOutputType(LineString)) return fields;

          const getLineStrings = (data: PostGISResolvedData) =>
            (data.__geojson.coordinates as number[][][]).map((coord) => ({
              __gisType: getGISTypeName(GIS_SUBTYPE.LineString, hasZ, hasM),
              __srid: data.__srid,
              __geojson: {
                type: "LineString",
                coordinates: coord,
              },
            }));
          getLineStrings.isSyncAndSafe = true;

          return extend(
            fields,
            {
              lines: {
                type: new GraphQLList(LineString),
                plan($data: Step<PostGISResolvedData>) {
                  return lambda($data, getLineStrings);
                },
              },
            },
            "PostGIS MultiLineString lines field"
          );
        },
      },
    },
  };

export default Postgis_MultiLineString_LineStringsPlugin;
