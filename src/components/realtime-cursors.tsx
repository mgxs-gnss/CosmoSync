"use client";

import { useRealtimeCursors } from "@/hooks/use-realtime-cursors";
import { Cursor } from "./cursor";

const THROTTLE_MS = 50;

export const RealtimeCursors = ({
  roomName,
  color,
}: {
  roomName: string;
  color: string;
}) => {
  const { cursors } = useRealtimeCursors({
    roomName,
    throttleMs: THROTTLE_MS,
    color,
  });

  return (
    <>
      {Object.keys(cursors).map((id) => (
        <Cursor
          key={id}
          className="fixed z-50 transition-transform duration-100"
          style={{
            transform: `translate(${cursors[id].position.x}px, ${cursors[id].position.y}px)`,
          }}
          color={cursors[id].color}
        />
      ))}
    </>
  );
};
