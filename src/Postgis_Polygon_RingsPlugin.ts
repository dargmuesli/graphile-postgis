import type { Step } from "postgraphile/grafast";
import type { PostGISResolvedData } from "./types.ts";
import { GIS_SUBTYPE } from "./constants.ts";
import { getGISTypeName } from "./utils.ts";
import { version } from "./version.ts";

export const Postgis_Polygon_RingsPlugin: GraphileConfig.Plugin = {
  name: "Postgis_Polygon_RingsPlugin",
  description: "Enhancing the `Polygon` type",
  version,

  schema: {
    hooks: {
      GraphQLObjectType_fields(fields, build, context) {
        const { pgGISType } = context.scope;
        if (pgGISType?.subtype !== GIS_SUBTYPE.Polygon) {
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

        const getExterior = (data: PostGISResolvedData) => ({
          __gisType: getGISTypeName(GIS_SUBTYPE.LineString, hasZ, hasM),
          __srid: data.__srid,
          __geojson: {
            type: "LineString",
            coordinates: (data.__geojson.coordinates as number[][][])[0],
          },
        });

        const getInteriors = (data: PostGISResolvedData) =>
          (data.__geojson.coordinates as number[][][])
            .slice(1)
            .map((coord) => ({
              __gisType: getGISTypeName(GIS_SUBTYPE.LineString, hasZ, hasM),
              __srid: data.__srid,
              __geojson: {
                type: "LineString",
                coordinates: coord,
              },
            }));

        return extend(
          fields,
          {
            exterior: {
              type: LineString,
              plan($data: Step<PostGISResolvedData>) {
                return lambda($data, getExterior);
              },
            },
            interiors: {
              type: new GraphQLList(LineString),
              plan($data: Step<PostGISResolvedData>) {
                return lambda($data, getInteriors);
              },
            },
          },
          "PostGIS Polygon rings fields"
        );
      },
    },
  },
};

export default Postgis_Polygon_RingsPlugin;
