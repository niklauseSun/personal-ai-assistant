import Svg, { Path } from "react-native-svg";
import { colors } from "../theme";
import type { IconProps } from "./types";

export function ChevronRightIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="m9 6 6 6-6 6"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
