import Svg, { Path } from "react-native-svg";
import { colors } from "../theme";
import type { IconProps } from "./types";

export function LinkIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10 14a4 4 0 0 1 0-5.66l3-3a4 4 0 0 1 5.66 5.66l-1.5 1.5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14 10a4 4 0 0 1 0 5.66l-3 3a4 4 0 0 1-5.66-5.66l1.5-1.5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
