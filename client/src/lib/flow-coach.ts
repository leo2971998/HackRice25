import type { MandateAttachment, MandateStatus } from "@/types/api"

export const FLOW_COACH_OPEN_EVENT = "flowcoach:open"
export const FLOW_COACH_MANDATE_EVENT = "flowcoach:mandate"
export const FLOW_COACH_MANDATE_RESOLVED_EVENT = "flowcoach:mandate:resolved"

export type FlowCoachMandateEventDetail = {
  message?: string
  mandate: MandateAttachment
}

export type FlowCoachMandateResolvedDetail = {
  id: string
  status: MandateStatus
}

export function openFlowCoach() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(FLOW_COACH_OPEN_EVENT))
}

export function pushMandateToFlowCoach(detail: FlowCoachMandateEventDetail) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(FLOW_COACH_MANDATE_EVENT, { detail }))
}

export function notifyMandateResolved(detail: FlowCoachMandateResolvedDetail) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(FLOW_COACH_MANDATE_RESOLVED_EVENT, { detail }))
}
