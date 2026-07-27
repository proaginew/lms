"use client";

import { useClerk } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";

const PLAYBACK_CHANNEL = "aim-lms-playback-lock";
const WATERMARK_TEXT = "AIM Technologies";

type Props = {
  courseFolderId: string;
  itemId: string;
};

type SessionResponse = {
  token?: string;
  message?: string;
};

export default function ProctoredVideoPlayer({ courseFolderId, itemId }: Props) {
  const { signOut } = useClerk();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tabIdRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const tokenRef = useRef<string | null>(null);
  const endingRef = useRef(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Starting secure session…");

  const forceLogout = useCallback(
    async (reason: string) => {
      if (endingRef.current) return;
      endingRef.current = true;
      setError(reason);
      setStreamUrl(null);
      tokenRef.current = null;
      try {
        await fetch("/api/playback/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "end", tabId: tabIdRef.current, itemId }),
        });
      } catch {
        // ignore
      }
      await signOut({ redirectUrl: "/signin" });
    },
    [signOut, itemId],
  );

  const claimSession = useCallback(async () => {
    const response = await fetch("/api/playback/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "claim",
        courseFolderId,
        itemId,
        tabId: tabIdRef.current,
      }),
    });
    const data = (await response.json()) as SessionResponse;
    if (!response.ok || !data.token) {
      throw new Error(data.message ?? "Could not start playback session");
    }
    tokenRef.current = data.token;
    const url = `/api/drive/${encodeURIComponent(itemId)}/stream?courseFolderId=${encodeURIComponent(
      courseFolderId,
    )}&playbackToken=${encodeURIComponent(data.token)}`;
    setStreamUrl(url);
    setStatus("Secure playback active");
    setError(null);
  }, [courseFolderId, itemId]);

  useEffect(() => {
    let cancelled = false;
    let channel: BroadcastChannel | null = null;

    async function start() {
      try {
        await claimSession();
        if (cancelled) return;

        channel = new BroadcastChannel(PLAYBACK_CHANNEL);
        channel.postMessage({ type: "claim", tabId: tabIdRef.current });
        channel.onmessage = (event: MessageEvent<{ type?: string; tabId?: string }>) => {
          if (event.data?.type === "claim" && event.data.tabId !== tabIdRef.current) {
            void forceLogout("Another tab started playback. Signing out…");
          }
        };
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to start playback");
          setStatus("Playback blocked");
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      channel?.close();
      const token = tokenRef.current;
      void fetch("/api/playback/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "end",
          token,
          tabId: tabIdRef.current,
          itemId,
        }),
        keepalive: true,
      });
    };
  }, [claimSession, forceLogout, itemId]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        void forceLogout("Window minimized or hidden. Signing out…");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [forceLogout]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const token = tokenRef.current;
      if (!token || endingRef.current) return;
      void (async () => {
        const response = await fetch("/api/playback/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "heartbeat",
            token,
            tabId: tabIdRef.current,
            itemId,
          }),
        });
        if (response.status === 409 || response.status === 401 || response.status === 403) {
          await forceLogout("Playback session ended. Signing out…");
        }
      })();
    }, 15_000);
    return () => window.clearInterval(id);
  }, [forceLogout, itemId]);

  useEffect(() => {
    const onContextMenu = (event: Event) => event.preventDefault();
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        ["s", "S", "p", "P", "u", "U"].includes(event.key)
      ) {
        event.preventDefault();
      }
      if (event.key === "F12") {
        event.preventDefault();
      }
    };
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs text-[var(--yt-muted)]">
        <p>{status}</p>
        <p>Proctored · watermarked · single tab</p>
      </div>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div
        className="player-frame overflow-hidden bg-black lg:rounded-xl"
        onContextMenu={(event) => event.preventDefault()}
      >
        {streamUrl ? (
          <>
            <video
              ref={videoRef}
              key={streamUrl}
              controls
              controlsList="nodownload noremoteplayback noplaybackrate"
              disablePictureInPicture
              disableRemotePlayback
              playsInline
              className="aspect-video w-full"
              src={streamUrl}
            >
              Your browser does not support video playback.
            </video>
            <div className="player-watermark" aria-hidden>
              {Array.from({ length: 12 }).map((_, index) => (
                <div key={index} className="player-watermark-tile">
                  <span>{WATERMARK_TEXT}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex aspect-video items-center justify-center text-sm text-gray-400">
            {error ? "Playback unavailable" : "Preparing secure player…"}
          </div>
        )}
      </div>
    </div>
  );
}
