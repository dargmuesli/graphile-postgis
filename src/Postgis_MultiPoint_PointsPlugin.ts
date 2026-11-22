import type { Step } from "postgraphile/grafast";
import type { PostGISResolvedData } from "./types.ts";
import { GIS_SUBTYPE } from "./constants.ts";
import { getGISTypeName } from "./utils.ts";
import { version } from "./version.ts";

export const Postgis_MultiPoint_PointsPlugin: GraphileConfig.Plugin = {
  name: "Postgis_MultiPoint_PointsPlugin",
  description: "Enhancing the `MultiPoint` type",
  version,

  schema: {
    hooks: {
      GraphQLObjectType_fields(fields, build, context) {
        const { pgGISType } = context.scope;
        if (pgGISType?.subtype !== GIS_SUBTYPE.MultiPoint) {
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
          GIS_SUBTYPE.Point,
          hasZ,
          hasM,
          srid
        );
        const Point = typeName ? build.getTypeByName(typeName) : null;
        if (!build.graphql.isOutputType(Point)) return fields;

        const getPoints = (data: PostGISResolvedData) =>
          (data.__geojson.coordinates as number[][]).map((coord) => ({
            __gisType: getGISTypeName(GIS_SUBTYPE.Point, hasZ, hasM),
            __srid: data.__srid,
            __geojson: {
              type: "Point",
              coordinates: coord,
            },
          }));

        return extend(
          fields,
          {
            points: {
              type: new GraphQLList(Point),
              plan($data: Step<PostGISResolvedData>) {
                return lambda($data, getPoints);
              },
            },
          },
          "PostGIS MultiPoint points field"
        );
      },
    },
  },
};

export default Postgis_MultiPoint_PointsPlugin;
