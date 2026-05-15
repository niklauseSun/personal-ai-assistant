import { CameraView, type BarcodeScanningResult, useCameraPermissions } from "expo-camera";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, sharedStyles } from "../ui/styles";

interface ScanBindingScreenProps {
  onBack: () => void;
  onScanned: (rawValue: string) => void;
}

export function ScanBindingScreen({ onBack, onScanned }: ScanBindingScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [hasScanned, setHasScanned] = useState(false);
  const [manualValue, setManualValue] = useState("");

  const submitManualValue = () => {
    const normalized = manualValue.trim();
    if (!normalized) {
      Alert.alert("Missing QR content", "Paste the desktop binding payload first.");
      return;
    }

    onScanned(normalized);
  };

  const handleScanned = (result: BarcodeScanningResult) => {
    if (hasScanned) {
      return;
    }

    setHasScanned(true);
    onScanned(result.data);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={sharedStyles.label}>Bind</Text>
          <Text style={sharedStyles.title}>Scan desktop QR</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={[sharedStyles.button, sharedStyles.buttonGhost]}
        >
          <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextGhost]}>Back</Text>
        </Pressable>
      </View>

      {!permission ? (
        <View style={sharedStyles.card}>
          <Text style={sharedStyles.muted}>Checking camera permission...</Text>
        </View>
      ) : permission.granted ? (
        <View style={styles.cameraBlock}>
          <View style={styles.cameraFrame}>
            <CameraView
              barcodeScannerSettings={{
                barcodeTypes: ["qr"]
              }}
              onBarcodeScanned={hasScanned ? undefined : handleScanned}
              style={StyleSheet.absoluteFill}
            />
            <View pointerEvents="none" style={styles.scanFrame} />
          </View>
          {hasScanned ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setHasScanned(false)}
              style={[sharedStyles.button, sharedStyles.buttonGhost]}
            >
              <Text style={[sharedStyles.buttonText, sharedStyles.buttonTextGhost]}>
                Scan again
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={[sharedStyles.card, styles.permissionCard]}>
          <Text style={styles.cardTitle}>Camera access</Text>
          <Text style={sharedStyles.muted}>Camera permission is needed for QR scanning.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void requestPermission()}
            style={sharedStyles.button}
          >
            <Text style={sharedStyles.buttonText}>Allow camera</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.manualBlock}>
        <Text style={sharedStyles.label}>Manual payload</Text>
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
          <Text style={sharedStyles.buttonText}>Bind from text</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cameraFrame: {
    backgroundColor: "#111827",
    borderRadius: 8,
    height: 360,
    overflow: "hidden"
  },
  cameraBlock: {
    gap: 10
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
