import Svg, { Circle, Path } from "react-native-svg";
import { colors } from "../theme";
import type { IconProps } from "./types";

export function BellIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 15v-4a6 6 0 0 1 12 0v4l1.5 2.25h-15L6 15Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path
        d="M10 19a2 2 0 1 0 4 0"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Circle cx="18.5" cy="5.5" r="2.5" fill={color} />
    </Svg>
  );
}
