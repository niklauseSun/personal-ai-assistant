import { useCallback, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  Camera,
  type CameraRuntimeError,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner
} from "react-native-vision-camera";
import { colors, sharedStyles } from "../ui/styles";

interface ScanBindingScreenProps {
  onBack: () => void;
  onScanned: (rawValue: string) => void;
}

export function ScanBindingScreen({ onBack, onScanned }: ScanBindingScreenProps) {
  const device = useCameraDevice("back");
  const { hasPermission, requestPermission } = useCameraPermission();
  const hasScannedRef = useRef(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [isRequestingPermission, setRequestingPermission] = useState(false);
  const [cameraError, setCameraError] = useState<string>();
  const [manualValue, setManualValue] = useState("");

  const submitManualValue = () => {
    const normalized = manualValue.trim();
    if (!normalized) {
      Alert.alert("缺少绑定内容", "请先粘贴桌面端二维码中的绑定内容。");
      return;
    }

    onScanned(normalized);
  };

  const handleScannedValue = useCallback(
    (rawValue: string | undefined) => {
      const normalized = rawValue?.trim();
      if (!normalized || hasScannedRef.current) {
        return;
      }

      hasScannedRef.current = true;
      setHasScanned(true);
      onScanned(normalized);
    },
    [onScanned]
  );

  const codeScanner = useCodeScanner({
    codeTypes: ["qr"],
    onCodeScanned: (codes) => {
      handleScannedValue(codes.find((code) => code.type === "qr" && code.value)?.value);
    }
  });

  const requestCameraAccess = async () => {
    setRequestingPermission(true);
    try {
      const granted = await requestPermission();
      if (!granted) {
        setCameraError("未获得相机权限，请粘贴桌面端二维码内容完成绑定。");
      } else {
        setCameraError(undefined);
      }
    } catch (error) {
      setCameraError(toCameraErrorMessage(error));
    } finally {
      setRequestingPermission(false);
    }
  };

  const scanAgain = () => {
    hasScannedRef.current = false;
    setHasScanned(false);
    setCameraError(undefined);
  };

  const handleCameraError = (error: CameraRuntimeError) => {
    setCameraError(toCameraErrorMessage(error));
  };

  const renderCameraContent = () => {
    if (!hasPermission) {
      return (
        <View style={[sharedStyles.card, styles.permissionCard]}>
          <Text style={styles.cardTitle}>需要相机权限</Text>
          <Text style={sharedStyles.muted}>允许访问相机后即可扫描桌面端绑定二维码。</Text>
          <Pressable
            accessibilityRole="button"
            disabled={isRequestingPermission}
            onPress={() => void requestCameraAccess()}
            style={sharedStyles.button}
          >
            <Text style={sharedStyles.buttonText}>
              {isRequestingPermission ? "请求中..." : "允许相机"}
            </Text>
          </Pressable>
        </View>
      );
    }

    if (!device) {
      return (
        <View style={[sharedStyles.card, styles.permissionCard]}>
          <Text style={styles.cardTitle}>无法启动相机</Text>
          <Text style={sharedStyles.muted}>
            当前设备没有可用的后置摄像头，请粘贴二维码内容完成绑定。
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.cameraBlock}>
        <View style={styles.cameraFrame}>
          <Camera
            codeScanner={codeScanner}
            device={device}
            isActive={!hasScanned}
            onError={handleCameraError}
            style={styles.cameraPreview}
          />
          <View pointerEvents="none" style={styles.scanFrame} />
        </View>
        {hasScanned ? (
          <Pressable
            accessibilityRole="button"
            onPress={scanAgain}
            style={[sharedStyles.button, sharedStyles.buttonGhost]}
          >
            <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextGhost]}>重新扫描</Text>
          </Pressable>
        ) : null}
        {cameraError ? <Text style={styles.cameraError}>{cameraError}</Text> : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={sharedStyles.label}>绑定</Text>
          <Text style={sharedStyles.title}>扫描桌面端二维码</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={[sharedStyles.button, sharedStyles.buttonGhost]}
        >
          <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextGhost]}>返回</Text>
        </Pressable>
      </View>

      {renderCameraContent()}

      <View style={styles.manualBlock}>
        <Text style={sharedStyles.label}>手动绑定内容</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          onChangeText={setManualValue}
          placeholder="{...}"
          style={[sharedStyles.input, styles.manualInput]}
          textAlignVertical="top"
          value={manualValue}
        />
        <Pressable accessibilityRole="button" onPress={submitManualValue} style={sharedStyles.button}>
          <Text style={sharedStyles.buttonText}>使用文本绑定</Text>
        </Pressable>
      </View>
    </View>
  );
}

function toCameraErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return `相机启动失败：${error.message}`;
  }

  return "相机启动失败，请粘贴二维码内容完成绑定。";
}

const styles = StyleSheet.create({
  cameraFrame: {
    backgroundColor: "#111827",
    borderRadius: 8,
    height: 360,
    overflow: "hidden"
  },
  cameraPreview: {
    ...StyleSheet.absoluteFillObject
  },
  cameraBlock: {
    gap: 10
  },
  cameraError: {
    color: colors.danger,
    fontSize: 13
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700"
  },
  container: {
    flex: 1,
    gap: 16
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  manualBlock: {
    gap: 8
  },
  manualInput: {
    minHeight: 92
  },
  permissionCard: {
    gap: 12
  },
  scanFrame: {
    alignSelf: "center",
    borderColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 3,
    height: 220,
    marginTop: 70,
    width: 220
  }
});
