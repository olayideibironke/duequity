import { Callout } from "@/components/ui/surface";

/**
 * CLAIMANT DOCUMENT SUBMISSION
 *
 * ============================ IMPORTANT ==================================
 * There is no claimant document upload endpoint, and this control therefore does
 * not accept a file.
 *
 * It previously presented a working upload: it validated a file client side, then
 * displayed a success message without transmitting anything. That is a worse
 * outcome than no control at all. A claimant who has photographed their driver
 * license and been told "Received" reasonably believes the document is with us,
 * stops chasing it, and their claim stalls on a requirement they think is met.
 *
 * A claimant upload endpoint cannot be built before claimant authentication
 * exists, because an unauthenticated document upload accepting identity documents
 * is a serious exposure in its own right. So this surface states the position and
 * tells the claimant what actually reaches us.
 *
 * WHEN THIS IS IMPLEMENTED, IT NEEDS
 *
 *   - authenticated claimant sessions
 *   - a claimant-scoped upload route that verifies the request belongs to the
 *     claimant's own claim before accepting bytes
 *   - private durable object storage, not the local filesystem
 *   - malware scanning before the document becomes reviewable
 *   - encryption at rest and short-lived signed read URLs
 *   - retention and deletion controls
 *
 * The staff-side upload route already enforces the equivalent controls it can
 * enforce locally, and is the path by which a document currently enters a claim.
 * =========================================================================
 */

export function DocumentUpload({ documentLabel }: { documentLabel: string }) {
  return (
    <Callout tone="caution" title="Portal upload is not available yet">
      <div className="space-y-2">
        <p>
          You cannot send your {documentLabel.toLowerCase()} through this page
          yet. Secure document upload is not active in the claimant portal, and
          we will not show you a control that appears to send a document when it
          does not.
        </p>

        <p>
          Your specialist will tell you exactly how to provide this document and
          will confirm in writing once it has been received and accepted. This
          page will show it move to Under review and then to Accepted.
        </p>

        <p className="text-sm">
          Please do not email identity documents. If you are asked to email one
          by someone claiming to be from Duequity, treat that request as
          suspicious and report it to{" "}
          <span className="font-mono text-sm">security@duequity.com</span>.
        </p>
      </div>
    </Callout>
  );
}
