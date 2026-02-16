import type { GraphQLOutputType } from "postgraphile/graphql";
import debug from "./debug";
import { GIS_SUBTYPE } from "./constants";
import { getGISTypeName } from "./utils";
import { version } from "../package.json";

export const Postgis_GeometryCollection_GeometriesPlugin: GraphileConfig.Plugin =
  {
    name: "Postgis_GeometryCollection_GeometriesPlugin",
    description: "Enhancing the `GeometryCollection` type",
    version,

    schema: {
      hooks: {
        GraphQLObjectType_fields(fields, build, context) {
          const {
            scope: { isPgGISType, pgGISTypeName, pgGISTypeDetails },
          } = context;
          if (
            !isPgGISType ||
            !pgGISTypeDetails ||
            pgGISTypeDetails.subtype !== GIS_SUBTYPE.GeometryCollection
          ) {
            return fields;
          }
          const {
            extend,
            pgGISGraphQLInterfaceTypesByType,
            graphql: { GraphQLList },
          } = build;
          const hasZ = pgGISTypeDetails.hasZ;
          const hasM = pgGISTypeDetails.hasM;
          const zmflag = (hasZ ? 2 : 0) + (hasM ? 1 : 0);
          const interfaceTypeName =
            pgGISGraphQLInterfaceTypesByType[pgGISTypeName!]?.[zmflag];
          if (!interfaceTypeName) {
            debug("Unexpectedly couldn't find the interface");
            return fields;
          }
          const Interface = build.getTypeByName(
            interfaceTypeName
          ) as GraphQLOutputType;
          if (!Interface) {
            debug("Unexpectedly couldn't find the interface type");
            return fields;
          }

          return extend(
            fields,
            {
              geometries: {
                type: new GraphQLList(Interface),
                resolve(data: any) {
                  return data.__geojson.geometries.map((geom: any) => {
                    return {
                      __gisType: getGISTypeName(
                        GIS_SUBTYPE[
                          geom.type as keyof typeof GIS_SUBTYPE
                        ] as any,
                        hasZ,
                        hasM
                      ),
                      __srid: data.__srid,
                      __geojson: geom,
                    };
                  });
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
