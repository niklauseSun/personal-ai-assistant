import Svg, { Circle, Path } from "react-native-svg";
import { colors } from "../theme";
import type { IconProps } from "./types";

export function SearchIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="6.5" stroke={color} strokeWidth={1.5} />
      <Path d="m20 20-3.5-3.5" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}
