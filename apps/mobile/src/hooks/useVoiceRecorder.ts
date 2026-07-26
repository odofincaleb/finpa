import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
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

function startOptions() {
  return {
    lang: "en-US",
    interimResults: true,
    // Keep session alive until we call stop() (hold-to-talk)
    continuous: true,
    addsPunctuation: false,
    ...(Platform.OS === "android"
      ? {
          androidIntentOptions: {
            // Default silence windows are very short and end listening early
            EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 12_000,
            EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 12_000,
            EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 20_000,
          },
        }
      : {}),
  };
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
  const holdingRef = useRef(false);
  const sendOnEndRef = useRef(false);
  const onFinalRef = useRef(onFinalTranscript);
  onFinalRef.current = onFinalTranscript;

  useEffect(() => {
    const mod = getSpeechModule();
    if (!mod) return;

    const onStart = () => setListening(true);
    const onEnd = () => {
      // Android often ends the session on a short pause — restart while still holding
      if (holdingRef.current) {
        try {
          mod.start(startOptions());
          return;
        } catch {
          // fall through and finalize
        }
      }

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
      if (!text) return;
      transcriptRef.current = text;
      setTranscript(text);
    };
    const onError = (event: { error: string; message?: string }) => {
      // Quiet / aborted while holding — try again
      if (
        holdingRef.current &&
        (event.error === "no-speech" ||
          event.error === "speech-timeout" ||
          event.error === "client")
      ) {
        try {
          mod.start(startOptions());
          return;
        } catch {
          // continue to cleanup
        }
      }

      setListening(false);
      if (event.error === "aborted") {
        sendOnEndRef.current = false;
        return;
      }
      if (event.error === "no-speech") {
        return;
      }
      sendOnEndRef.current = false;
      holdingRef.current = false;
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

      holdingRef.current = true;
      sendOnEndRef.current = true;
      transcriptRef.current = "";
      setTranscript("");
      setListening(true);

      mod.start(startOptions());
    } catch (err) {
      holdingRef.current = false;
      setListening(false);
      sendOnEndRef.current = false;
      const message =
        err instanceof Error ? err.message : "Could not start speech recognition.";
      Alert.alert("Voice unavailable", message);
    }
  }, []);

  const stop = useCallback(() => {
    holdingRef.current = false;
    const mod = getSpeechModule();
    if (!mod) {
      setListening(false);
      return;
    }
    try {
      mod.stop();
    } catch {
      setListening(false);
      const text = transcriptRef.current.trim();
      if (sendOnEndRef.current && text) {
        sendOnEndRef.current = false;
        onFinalRef.current(text);
      }
      transcriptRef.current = "";
      setTranscript("");
    }
  }, []);

  return { listening, transcript, start, stop };
}
