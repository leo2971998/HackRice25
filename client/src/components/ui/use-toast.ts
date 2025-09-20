import * as React from "react"

import type { ToastActionElement, ToastProps } from "@/components/ui/toast"

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

type Toast = Partial<ToasterToast>

type State = {
  toasts: ToasterToast[]
}

type Action =
  | { type: "ADD_TOAST"; toast: ToasterToast }
  | { type: "UPDATE_TOAST"; toast: Partial<ToasterToast> }
  | { type: "DISMISS_TOAST"; toastId?: string }
  | { type: "REMOVE_TOAST"; toastId?: string }

const TOAST_LIMIT = 3
const TOAST_REMOVE_DELAY = 1000

const actionCreators = {
  addToast: (toast: ToasterToast): Action => ({ type: "ADD_TOAST", toast }),
  updateToast: (toast: Partial<ToasterToast>): Action => ({ type: "UPDATE_TOAST", toast }),
  dismissToast: (toastId?: string): Action => ({ type: "DISMISS_TOAST", toastId }),
  removeToast: (toastId?: string): Action => ({ type: "REMOVE_TOAST", toastId }),
}

const listeners = new Set<(state: State) => void>()
let memoryState: State = { toasts: [] }
const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }
    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((toast) =>
          toast.id === action.toast.id ? { ...toast, ...action.toast } : toast
        ),
      }
    case "DISMISS_TOAST":
      const { toastId } = action

      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((toast) =>
          toast.id === toastId || toastId === undefined
            ? { ...toast, open: false }
            : toast
        ),
      }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return { ...state, toasts: [] }
      }
      return {
        ...state,
        toasts: state.toasts.filter((toast) => toast.id !== action.toastId),
      }
    default:
      return state
  }
}

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

function addToRemoveQueue(toastId: string) {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch(actionCreators.removeToast(toastId))
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

function toast({ ...props }: Toast) {
  const id = props.id ?? Math.random().toString(36).slice(2)

  const update = (updateProps: Toast) =>
    dispatch(actionCreators.updateToast({ ...updateProps, id }))
  const dismiss = () => dispatch(actionCreators.dismissToast(id))

  dispatch(
    actionCreators.addToast({
      ...props,
      id,
      open: true,
    })
  )

  return {
    id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.add(setState)
    return () => {
      listeners.delete(setState)
    }
  }, [])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch(actionCreators.dismissToast(toastId)),
  }
}

const dismiss = (toastId?: string) => dispatch(actionCreators.dismissToast(toastId))

export { useToast, toast, dismiss, TOAST_LIMIT, TOAST_REMOVE_DELAY }
export type { Toast, ToasterToast, ToastActionElement }
