import { useCallback, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  Camera,
  type CameraRuntimeError,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner
} from "react-native-vision-camera";
import { AppHeader, IconButton } from "../ui/components";
import { ChevronLeftIcon } from "../ui/icons";
import { colors, radius, shadows, spacing, typography } from "../ui/theme";
import { t } from "../ui/i18n";
import { sharedStyles } from "../ui/styles";

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
      Alert.alert(t.scan.manualMissingTitle, t.scan.manualMissingBody);
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
        setCameraError(t.scan.cameraErrorFallback);
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
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t.scan.permissionTitle}</Text>
          <Text style={styles.cardBody}>{t.scan.permissionHint}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={isRequestingPermission}
            onPress={() => void requestCameraAccess()}
            style={[sharedStyles.button, isRequestingPermission && styles.disabled]}
          >
            <Text style={sharedStyles.buttonText}>
              {isRequestingPermission ? t.scan.requestingPermission : t.scan.grantCamera}
            </Text>
          </Pressable>
        </View>
      );
    }

    if (!device) {
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t.scan.noCameraTitle}</Text>
          <Text style={styles.cardBody}>{t.scan.noCameraHint}</Text>
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
            <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextGhost]}>{t.scan.rescan}</Text>
          </Pressable>
        ) : null}
        {cameraError ? <Text style={styles.cameraError}>{cameraError}</Text> : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title={t.scan.title}
        subtitle={t.scan.subtitle}
        actions={
          <IconButton accessibilityLabel={t.scan.back} onPress={onBack}>
            <ChevronLeftIcon size={22} color={colors.text} />
          </IconButton>
        }
      />

      <View style={styles.body}>
        {renderCameraContent()}

        <View style={styles.manualBlock}>
          <Text style={styles.label}>{t.scan.manualLabel}</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            onChangeText={setManualValue}
            placeholder={t.scan.manualPlaceholder}
            placeholderTextColor={colors.textSubtle}
            style={[sharedStyles.input, styles.manualInput]}
            textAlignVertical="top"
            value={manualValue}
          />
          <Pressable accessibilityRole="button" onPress={submitManualValue} style={sharedStyles.button}>
            <Text style={sharedStyles.buttonText}>{t.scan.manualSubmit}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function toCameraErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return `${t.scan.cameraErrorPrefix}${error.message}`;
  }

  return t.scan.cameraErrorFallback;
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: spacing.lg,
    paddingHorizontal: spacing.lg
  },
  cameraBlock: {
    gap: spacing.md
  },
  cameraError: {
    ...typography.caption,
    color: colors.danger
  },
  cameraFrame: {
    backgroundColor: "#0f172a",
    borderRadius: radius.xl,
    height: 320,
    overflow: "hidden"
  },
  cameraPreview: {
    ...StyleSheet.absoluteFillObject
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    gap: spacing.sm,
    padding: spacing.lg,
    ...shadows.card
  },
  cardBody: {
    ...typography.caption,
    color: colors.textMuted
  },
  cardTitle: {
    ...typography.sectionTitle
  },
  container: {
    flex: 1,
    gap: spacing.md
  },
  disabled: {
    opacity: 0.5
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "600"
  },
  manualBlock: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    gap: spacing.sm,
    padding: spacing.lg,
    ...shadows.card
  },
  manualInput: {
    minHeight: 96
  },
  scanFrame: {
    alignSelf: "center",
    borderColor: "#ffffff",
    borderRadius: radius.lg,
    borderWidth: 3,
    height: 200,
    marginTop: 60,
    width: 200
  }
});
