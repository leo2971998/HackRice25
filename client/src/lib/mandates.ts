import { apiFetch } from "@/lib/api-client"
import type { Mandate, MandateStatus } from "@/types/api"

type MandateResponse = {
  id: string
  status: MandateStatus
  type?: Mandate["type"]
  data?: Record<string, unknown>
  created_at?: string | null
  updated_at?: string | null
  result?: string
}

type CreateMandatePayload = {
  type: Mandate["type"]
  data: Record<string, unknown>
}

function mapMandate(response: MandateResponse, previous?: Mandate): Mandate {
  return {
    id: response.id,
    type: response.type ?? previous?.type ?? "intent",
    status: response.status,
    data: response.data ?? previous?.data ?? {},
    createdAt: response.created_at ?? previous?.createdAt ?? null,
    updatedAt: response.updated_at ?? previous?.updatedAt ?? null,
  }
}

export async function createMandate(payload: CreateMandatePayload): Promise<Mandate> {
  const response = await apiFetch<MandateResponse>("/ap2/mandates", {
    method: "POST",
    body: JSON.stringify(payload),
  })
  return mapMandate(response)
}

export async function approveMandate(id: string, previous?: Mandate): Promise<Mandate> {
  const response = await apiFetch<MandateResponse>(`/ap2/mandates/${id}/approve`, {
    method: "POST",
  })
  return mapMandate({ ...previous, ...response, id } as MandateResponse, previous)
}

export async function declineMandate(id: string, previous?: Mandate): Promise<Mandate> {
  const response = await apiFetch<MandateResponse>(`/ap2/mandates/${id}/decline`, {
    method: "POST",
  })
  return mapMandate({ ...previous, ...response, id } as MandateResponse, previous)
}

export async function executeMandate(id: string): Promise<MandateResponse> {
  return apiFetch<MandateResponse>(`/ap2/mandates/${id}/execute`, {
    method: "POST",
  })
}
