import type { GraphQLOutputType } from "postgraphile/graphql";
import { GIS_SUBTYPE } from "./constants";
import { getGISTypeName } from "./utils";
import { version } from "../package.json";

export const Postgis_MultiPoint_PointsPlugin: GraphileConfig.Plugin = {
  name: "Postgis_MultiPoint_PointsPlugin",
  version,

  schema: {
    hooks: {
      GraphQLObjectType_fields(fields, build, context) {
        const {
          scope: {
            isPgGISType,
            pgGISTypeName,
            pgGISSubtype,
            pgGISHasZ,
            pgGISHasM,
            pgGISSrid,
          },
        } = context;
        if (!isPgGISType || pgGISSubtype !== GIS_SUBTYPE.MultiPoint) {
          return fields;
        }
        const {
          extend,
          getPostgisTypeByGeometryType,
          graphql: { GraphQLList },
        } = build;
        const hasZ = pgGISHasZ!;
        const hasM = pgGISHasM!;
        const srid = pgGISSrid!;
        const pointTypeName = getPostgisTypeByGeometryType(
          pgGISTypeName!,
          GIS_SUBTYPE.Point,
          hasZ,
          hasM,
          srid
        );
        const Point = pointTypeName
          ? (build.getTypeByName(pointTypeName) as GraphQLOutputType)
          : null;
        if (!Point) return fields;

        return extend(
          fields,
          {
            points: {
              type: new GraphQLList(Point),
              resolve(data: any) {
                return data.__geojson.coordinates.map((coord: any) => ({
                  __gisType: getGISTypeName(GIS_SUBTYPE.Point, hasZ, hasM),
                  __srid: data.__srid,
                  __geojson: {
                    type: "Point",
                    coordinates: coord,
                  },
                }));
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
