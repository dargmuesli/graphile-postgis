import type { Step } from "postgraphile/grafast";
import type { PostGISResolvedData } from "./types.ts";
import { GIS_SUBTYPE } from "./constants.ts";
import { getGISTypeName } from "./utils.ts";
import { version } from "./version.ts";

export const Postgis_MultiPolygon_PolygonsPlugin: GraphileConfig.Plugin = {
  name: "Postgis_MultiPolygon_PolygonsPlugin",
  description: "Enhancing the `MultiPolygon` type",
  version,

  schema: {
    hooks: {
      GraphQLObjectType_fields(fields, build, context) {
        const { pgGISType } = context.scope;
        if (pgGISType?.subtype !== GIS_SUBTYPE.MultiPolygon) {
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
          GIS_SUBTYPE.Polygon,
          hasZ,
          hasM,
          srid
        );
        const Polygon = typeName ? build.getTypeByName(typeName) : null;
        if (!build.graphql.isOutputType(Polygon)) return fields;

        const getPolygons = (data: PostGISResolvedData) =>
          (data.__geojson.coordinates as number[][][][]).map((coord) => ({
            __gisType: getGISTypeName(GIS_SUBTYPE.Polygon, hasZ, hasM),
            __srid: data.__srid,
            __geojson: {
              type: "Polygon",
              coordinates: coord,
            },
          }));
        getPolygons.isSyncAndSafe = true;

        return extend(
          fields,
          {
            polygons: {
              type: new GraphQLList(Polygon),
              plan($data: Step<PostGISResolvedData>) {
                return lambda($data, getPolygons);
              },
            },
          },
          "PostGIS MultiPolygon polygons field"
        );
      },
    },
  },
};

export default Postgis_MultiPolygon_PolygonsPlugin;
