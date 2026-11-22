import type { Step } from "postgraphile/grafast";
import type { PostGISResolvedData, Subtype } from "./types.ts";
import debug from "./debug.ts";
import { GIS_SUBTYPE } from "./constants.ts";
import { getGISTypeName } from "./utils.ts";
import { version } from "./version.ts";

export const Postgis_GeometryCollection_GeometriesPlugin: GraphileConfig.Plugin =
  {
    name: "Postgis_GeometryCollection_GeometriesPlugin",
    description: "Enhancing the `GeometryCollection` type",
    version,

    schema: {
      hooks: {
        GraphQLObjectType_fields(fields, build, context) {
          const { pgGISType } = context.scope;
          if (pgGISType?.subtype !== GIS_SUBTYPE.GeometryCollection) {
            return fields;
          }
          const {
            extend,
            pgGISGraphQLInterfaceTypesByType,
            grafast: { lambda },
            graphql: { GraphQLList },
          } = build;
          const { hasZ, hasM } = pgGISType;
          const zmflag = (hasZ ? 2 : 0) + (hasM ? 1 : 0); // Equivalent to ST_Zmflag: https://postgis.net/docs/ST_Zmflag.html
          const interfaceTypeName =
            pgGISGraphQLInterfaceTypesByType[pgGISType.typeName]?.[zmflag];
          if (!interfaceTypeName) {
            debug("Unexpectedly couldn't find the interface");
            return fields;
          }
          const Interface = build.getTypeByName(interfaceTypeName);
          if (!build.graphql.isOutputType(Interface)) {
            debug("Unexpectedly couldn't find the interface type");
            return fields;
          }

          const getGeometries = (data: PostGISResolvedData) =>
            data.__geojson.geometries!.map((geom) => {
              return {
                __gisType: getGISTypeName(
                  GIS_SUBTYPE[geom.type as keyof typeof GIS_SUBTYPE] as Subtype,
                  hasZ,
                  hasM
                ),
                __srid: data.__srid,
                __geojson: geom,
              } satisfies PostGISResolvedData;
            });

          return extend(
            fields,
            {
              geometries: {
                type: new GraphQLList(Interface),
                plan($data: Step<PostGISResolvedData>) {
                  return lambda($data, getGeometries);
                },
              },
            },
            "PostGIS GeometryCollection geometries field"
          );
        },
      },
    },
  };

export default Postgis_GeometryCollection_GeometriesPlugin;
