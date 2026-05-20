import Svg, { Path } from "react-native-svg";
import { colors } from "../theme";
import type { IconProps } from "./types";

export function TerminalIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path
        d="m7 10 3 2-3 2M13 14h4"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
