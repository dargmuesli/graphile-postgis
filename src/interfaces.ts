export type Subtype = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface GISTypeDetails {
  subtype: Subtype;
  hasZ: boolean;
  hasM: boolean;
  srid: number;
}

declare global {
  namespace GraphileConfig {
    interface Plugins {
      PostgisVersionPlugin: true;
      PostgisInflectionPlugin: true;
      PostgisExtensionDetectionPlugin: true;
      PostgisRegisterTypesPlugin: true;
      PostgisColumnsPlugin: true;
      Postgis_Point_LatitudeLongitudePlugin: true;
      Postgis_LineString_PointsPlugin: true;
      Postgis_Polygon_RingsPlugin: true;
      Postgis_MultiPoint_PointsPlugin: true;
      Postgis_MultiLineString_LineStringsPlugin: true;
      Postgis_MultiPolygon_PolygonsPlugin: true;
      Postgis_GeometryCollection_GeometriesPlugin: true;
    }
  }
}
