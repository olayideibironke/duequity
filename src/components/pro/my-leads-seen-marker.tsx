"use client";

import {
  useEffect,
} from "react";

export function MyLeadsSeenMarker({
  assignmentIds,
}: {
  assignmentIds:
    string[];
}) {
  useEffect(
    () => {
      if (
        assignmentIds.length ===
        0
      ) {
        return;
      }

      let cancelled =
        false;

      async function acknowledge() {
        try {
          const response =
            await fetch(
              "/api/pro/my-leads/notification",
              {
                method:
                  "POST",

                cache:
                  "no-store",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    assignmentIds,
                  }),
              },
            );

          if (
            !response.ok ||
            cancelled
          ) {
            return;
          }

          window.dispatchEvent(
            new CustomEvent(
              "duequity:my-leads-seen",
            ),
          );
        } catch {
          /*
           * Notification acknowledgement must never interrupt lead work.
           */
        }
      }

      void acknowledge();

      return () => {
        cancelled =
          true;
      };
    },
    [
      assignmentIds,
    ],
  );

  return null;
}