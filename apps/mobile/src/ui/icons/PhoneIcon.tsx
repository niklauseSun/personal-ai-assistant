import Svg, { Path, Rect } from "react-native-svg";
import { colors } from "../theme";
import type { IconProps } from "./types";

export function PhoneIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x="7"
        y="3"
        width="10"
        height="18"
        rx="2.5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path
        d="M11 17.5h2"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}
