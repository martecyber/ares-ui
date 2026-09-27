/**
 * Detects the structured "missing plugin" 404 the backend's GlobalExceptionHandler returns —
 * either a MissingPluginException thrown by code that already knows which plugin is missing, or
 * a request to a path owned by a plugin that isn't currently installed/enabled (matched against
 * that plugin's own ownedPathPrefixes — see GlobalExceptionHandler#noHandlerFound). Both shapes
 * are a ProblemDetail body carrying a `pluginId` property, distinguishing them from an ordinary
 * 404 (e.g. "no Bug Hunting programme configured yet" returns a bare empty 404 body, no
 * ProblemDetail at all, since that's a normal controller response rather than a thrown
 * exception).
 *
 * There is no shared component anywhere in the app for this yet — see each call site for how it
 * renders the message (inline `<Message>` banner or `useToast()`, following whichever pattern
 * that view already uses for other API errors).
 */
export interface PluginRequiredError {
  pluginId: string;
  message: string;
}

export function pluginRequiredError(e: unknown): PluginRequiredError | null {
  const data = (e as { response?: { data?: { pluginId?: unknown; detail?: unknown } } })?.response?.data;
  if (data && typeof data.pluginId === 'string') {
    return {
      pluginId: data.pluginId,
      message:
        typeof data.detail === 'string' && data.detail
          ? data.detail
          : `This feature requires the "${data.pluginId}" plugin, which is not installed or enabled.`,
    };
  }
  return null;
}
