import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import Constants from "expo-constants";
import type { ExpoSpeechRecognitionResultEvent } from "expo-speech-recognition";

const isExpoGo = Constants.appOwnership === "expo";

type SpeechModule =
  typeof import("expo-speech-recognition").ExpoSpeechRecognitionModule;

function getSpeechModule(): SpeechModule | null {
  if (isExpoGo) return null;
  try {
    // Lazy require — top-level import crashes Expo Go (native module missing).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-speech-recognition")
      .ExpoSpeechRecognitionModule as SpeechModule;
  } catch {
    return null;
  }
}

/**
 * Hold-to-talk speech recognition.
 * Requires a development / EAS build with the expo-speech-recognition native module.
 * Expo Go shows a fallback alert (native STT is not available there).
 */
export function useVoiceRecorder(onFinalTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const transcriptRef = useRef("");
  const sendOnEndRef = useRef(false);
  const onFinalRef = useRef(onFinalTranscript);
  onFinalRef.current = onFinalTranscript;

  useEffect(() => {
    const mod = getSpeechModule();
    if (!mod) return;

    const onStart = () => setListening(true);
    const onEnd = () => {
      setListening(false);
      const text = transcriptRef.current.trim();
      if (sendOnEndRef.current && text) {
        sendOnEndRef.current = false;
        onFinalRef.current(text);
      }
      transcriptRef.current = "";
      setTranscript("");
    };
    const onResult = (event: ExpoSpeechRecognitionResultEvent) => {
      const text = event.results[0]?.transcript ?? "";
      transcriptRef.current = text;
      setTranscript(text);
    };
    const onError = (event: { error: string; message?: string }) => {
      setListening(false);
      sendOnEndRef.current = false;
      if (event.error === "aborted" || event.error === "no-speech") {
        return;
      }
      if (event.error === "not-allowed") {
        Alert.alert(
          "Microphone permission",
          "Allow microphone and speech recognition in system settings to use hold-to-talk.",
        );
        return;
      }
      Alert.alert(
        "Voice unavailable",
        event.message || "Speech recognition failed. Try typing instead.",
      );
    };

    const subs = [
      mod.addListener("start", onStart),
      mod.addListener("end", onEnd),
      mod.addListener("result", onResult),
      mod.addListener("error", onError),
    ];
    return () => {
      subs.forEach((s) => s.remove());
    };
  }, []);

  const start = useCallback(async () => {
    const mod = getSpeechModule();
    if (!mod) {
      Alert.alert(
        "Voice needs a rebuild",
        "Speech recognition works in the FINPA APK / development build, not Expo Go. Type your expense for now — e.g. “Spent ₦4500 on fuel”.",
      );
      return;
    }

    try {
      if (!mod.isRecognitionAvailable()) {
        Alert.alert(
          "Voice unavailable",
          "Speech recognition is not available on this device. Type your expense instead.",
        );
        return;
      }

      const permission = await mod.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Microphone permission",
          "Allow microphone and speech recognition to use hold-to-talk.",
        );
        return;
      }

      sendOnEndRef.current = true;
      transcriptRef.current = "";
      setTranscript("");
      setListening(true);

      // en-US is widely supported; Nigerian English still recognizes well.
      mod.start({
        lang: "en-US",
        interimResults: true,
        continuous: false,
        addsPunctuation: false,
      });
    } catch (err) {
      setListening(false);
      sendOnEndRef.current = false;
      const message =
        err instanceof Error ? err.message : "Could not start speech recognition.";
      Alert.alert("Voice unavailable", message);
    }
  }, []);

  const stop = useCallback(() => {
    const mod = getSpeechModule();
    if (!mod) {
      setListening(false);
      return;
    }
    try {
      mod.stop();
    } catch {
      setListening(false);
    }
  }, []);

  return { listening, transcript, start, stop };
}
