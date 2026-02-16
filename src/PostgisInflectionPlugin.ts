import { Subtype } from ".";
import { SUBTYPE_STRING_BY_SUBTYPE } from "./constants";
import { version } from "../package.json";

declare global {
  namespace GraphileBuild {
    interface Inflection {
      gisType(
        this: Inflection,
        details: {
          typeName: string;
          subtype: Subtype;
          hasZ: boolean;
          hasM: boolean;
        }
      ): string;
      gisInterfaceName(this: Inflection, details: { typeName: string }): string;
      gisDimensionInterfaceName(
        this: Inflection,
        details: {
          typeName: string;
          hasZ: boolean;
          hasM: boolean;
        }
      ): string;
      geojsonFieldName(this: Inflection): string;
      gisXFieldName(
        this: Inflection,
        details: { typeName: string; scope?: any }
      ): string;
      gisYFieldName(
        this: Inflection,
        details: { typeName: string; scope?: any }
      ): string;
      gisZFieldName(
        this: Inflection,
        details: { typeName: string; scope?: any }
      ): string;
    }
  }
}

export const PostgisInflectionPlugin: GraphileConfig.Plugin = {
  name: "PostgisInflectionPlugin",
  version,

  inflection: {
    add: {
      gisType(
        _preset,
        details: {
          typeName: string;
          subtype: Subtype;
          hasZ: boolean;
          hasM: boolean;
        }
      ) {
        const { typeName, subtype, hasZ, hasM } = details;
        return this.upperCamelCase(
          [
            typeName,
            SUBTYPE_STRING_BY_SUBTYPE[subtype],
            hasZ ? "z" : null,
            hasM ? "m" : null,
          ]
            .filter((_) => _)
            .join("-")
        );
      },
      gisInterfaceName(_preset, details: { typeName: string }) {
        return this.upperCamelCase(`${details.typeName}-interface`);
      },
      gisDimensionInterfaceName(
        _preset,
        details: {
          typeName: string;
          hasZ: boolean;
          hasM: boolean;
        }
      ) {
        const { typeName, hasZ, hasM } = details;
        return this.upperCamelCase(
          [
            typeName,
            SUBTYPE_STRING_BY_SUBTYPE[0],
            hasZ ? "z" : null,
            hasM ? "m" : null,
          ]
            .filter((_) => _)
            .join("-")
        );
      },
      geojsonFieldName() {
        return `geojson`;
      },
      gisXFieldName(_preset, details: { typeName: string; scope?: any }) {
        return details.typeName === "geography" ? "longitude" : "x";
      },
      gisYFieldName(_preset, details: { typeName: string; scope?: any }) {
        return details.typeName === "geography" ? "latitude" : "y";
      },
      gisZFieldName(_preset, details: { typeName: string; scope?: any }) {
        return details.typeName === "geography" ? "height" : "z";
      },
    },
  },
};

export default PostgisInflectionPlugin;
