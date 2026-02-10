import { motion } from 'framer-motion';
import React, { memo, useState } from 'react';
import { AnimatedAssistantIcon } from './animation-assistant-icon';
import { Response } from './elements/response';
import { MessageContent } from './elements/message';
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
  type ToolState,
} from './elements/tool';
import {
  McpTool,
  McpToolHeader,
  McpToolContent,
  McpToolInput,
  McpApprovalActions,
} from './elements/mcp-tool';
import { MessageActions } from './message-actions';
import { PreviewAttachment } from './preview-attachment';
import equal from 'fast-deep-equal';
import { cn, sanitizeText } from '@/lib/utils';
import { MessageEditor } from './message-editor';
import { MessageReasoning } from './message-reasoning';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { ChatMessage } from '@chat-template/core';
import { useDataStream } from './data-stream-provider';
import {
  createMessagePartSegments,
  formatNamePart,
  isNamePart,
  joinMessagePartSegments,
} from './databricks-message-part-transformers';
import { MessageError } from './message-error';
import { MessageOAuthError } from './message-oauth-error';
import { isCredentialErrorMessage } from '@/lib/oauth-error-utils';
import { Streamdown } from 'streamdown';
import { useApproval } from '@/hooks/use-approval';
import { VegaLiteChart } from './elements/vega-lite-chart';
import { parseVegaSpec } from '@/lib/vega-utils';

const PurePreviewMessage = ({
  message,
  allMessages,
  isLoading,
  setMessages,
  addToolApprovalResponse,
  sendMessage,
  regenerate,
  isReadonly,
  requiresScrollPadding,
}: {
  chatId: string;
  message: ChatMessage;
  allMessages: ChatMessage[];
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  addToolApprovalResponse: UseChatHelpers<ChatMessage>['addToolApprovalResponse'];
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  regenerate: UseChatHelpers<ChatMessage>['regenerate'];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
}) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [showErrors, setShowErrors] = useState(false);

  // Hook for handling MCP approval requests
  const { submitApproval, isSubmitting, pendingApprovalId } = useApproval({
    addToolApprovalResponse,
    sendMessage,
  });

  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === 'file',
  );

  // Extract non-OAuth error parts separately (OAuth errors are rendered inline)
  const errorParts = React.useMemo(
    () =>
      message.parts
        .filter((part) => part.type === 'data-error')
        .filter((part) => {
          // OAuth errors are rendered inline, not in the error section
          return !isCredentialErrorMessage(part.data);
        }),
    [message.parts],
  );

  useDataStream();

  const partSegments = React.useMemo(
    /**
     * We segment message parts into segments that can be rendered as a single component.
     * Used to render citations as part of the associated text.
     * Note: OAuth errors are included here for inline rendering, non-OAuth errors are filtered out.
     */
    () =>
      createMessagePartSegments(
        message.parts.filter(
          (part) =>
            part.type !== 'data-error' || isCredentialErrorMessage(part.data),
        ),
      ),
    [message.parts],
  );

  // Check if message only contains non-OAuth errors (no other content)
  const hasOnlyErrors = React.useMemo(() => {
    const nonErrorParts = message.parts.filter(
      (part) => part.type !== 'data-error',
    );
    // Only consider non-OAuth errors for this check
    return errorParts.length > 0 && nonErrorParts.length === 0;
  }, [message.parts, errorParts.length]);

  return (
    <div
      data-testid={`message-${message.role}`}
      className="group/message w-full"
      data-role={message.role}
    >
      <div
        className={cn('flex w-full items-start gap-2 md:gap-3', {
          'justify-end': message.role === 'user',
          'justify-start': message.role === 'assistant',
        })}
      >
        {message.role === 'assistant' && (
          <AnimatedAssistantIcon size={14} isLoading={isLoading} />
        )}

        <div
          className={cn('flex min-w-0 flex-col gap-3', {
            'w-full': message.role === 'assistant' || mode === 'edit',
            'min-h-96': message.role === 'assistant' && requiresScrollPadding,
            'max-w-[70%] sm:max-w-[min(fit-content,80%)]':
              message.role === 'user' && mode !== 'edit',
          })}
        >
          {attachmentsFromMessage.length > 0 && (
            <div
              data-testid={`message-attachments`}
              className="flex flex-row justify-end gap-2"
            >
              {attachmentsFromMessage.map((attachment) => (
                <PreviewAttachment
                  key={attachment.url}
                  attachment={{
                    name: attachment.filename ?? 'file',
                    contentType: attachment.mediaType,
                    url: attachment.url,
                  }}
                />
              ))}
            </div>
          )}

          {partSegments?.map((parts, index) => {
            const [part] = parts;
            const { type } = part;
            const key = `message-${message.id}-part-${index}`;

            if (type === 'reasoning' && part.text?.trim().length > 0) {
              return (
                <MessageReasoning
                  key={key}
                  isLoading={isLoading}
                  reasoning={part.text}
                />
              );
            }

            if (type === 'text') {
              if (isNamePart(part)) {
                // Skip rendering name parts - they're redundant with tool headers
                // and cause unwanted blue boxes outside the collapsed tool sections
                return null;
              }
              
              // Check if this is the FIRST non-name text part immediately after a TEXT-STREAMING tool
              // Only hide output from tools like Genie that stream tables/text
              // Don't hide text after tools with structured output (like Vega-Lite)
              
              // Look backwards to find the most recent tool, skipping over name parts and reasoning
              let precedingTool = null;
              let hasSeenOnlyReasoningOrNameSinceTool = true;
              
              for (let i = index - 1; i >= 0; i--) {
                const checkPart = partSegments[i]?.[0];
                
                if (checkPart?.type === 'dynamic-tool') {
                  precedingTool = checkPart;
                  break;
                }
                
                // Keep track if we've only seen reasoning or name parts since finding text
                if (checkPart?.type === 'reasoning' || isNamePart(checkPart)) {
                  continue;
                }
                
                // If we hit another text or different part type, this isn't the first text after the tool
                if (checkPart?.type === 'text') {
                  hasSeenOnlyReasoningOrNameSinceTool = false;
                  break;
                }
                
                // Stop at other part types
                break;
              }
              
              // Only hide if it follows a text-streaming tool (like Genie or News)
              // AND this is the first text part after that tool (aside from reasoning/name)
              const isTextStreamingTool = precedingTool?.toolName?.includes('genie') || precedingTool?.toolName?.includes('news');
              const isFirstTextAfterTextTool = precedingTool && isTextStreamingTool && hasSeenOnlyReasoningOrNameSinceTool;
              
              // Debug logging
              if (precedingTool && isTextStreamingTool) {
                console.log('[message.tsx] Found text after text-streaming tool:', {
                  toolName: precedingTool.toolName,
                  textPreview: joinMessagePartSegments(parts).substring(0, 100),
                  isFirstTextAfterTextTool,
                  hasSeenOnlyReasoningOrNameSinceTool,
                });
              }
              
              if (isFirstTextAfterTextTool) {
                // This is tool output from a text-streaming tool - skip independent rendering
                // It will be included in the tool's ToolContent section
                return null;
              }
              if (mode === 'view') {
                return (
                  <div key={key}>
                    <MessageContent
                      data-testid="message-content"
                      className={cn({
                        'w-fit break-words rounded-2xl px-3 py-2 text-right text-white':
                          message.role === 'user',
                        'bg-transparent px-0 py-0 text-left':
                          message.role === 'assistant',
                      })}
                      style={
                        message.role === 'user'
                          ? { backgroundColor: '#006cff' }
                          : undefined
                      }
                    >
                      <Response>
                        {sanitizeText(joinMessagePartSegments(parts))}
                      </Response>
                    </MessageContent>
                  </div>
                );
              }

              if (mode === 'edit') {
                return (
                  <div
                    key={key}
                    className="flex w-full flex-row items-start gap-3"
                  >
                    <div className="size-8" />
                    <div className="min-w-0 flex-1">
                      <MessageEditor
                        key={message.id}
                        message={message}
                        setMode={setMode}
                        setMessages={setMessages}
                        regenerate={regenerate}
                      />
                    </div>
                  </div>
                );
              }
            }

            // Render Databricks tool calls and results
            if (part.type === `dynamic-tool`) {
              const { toolCallId, input, state, errorText, output, toolName } = part;

              // Check if this is an MCP tool call by looking for approvalRequestId in metadata
              // This works across all states (approval-requested, approval-denied, output-available)
              const isMcpApproval = part.callProviderMetadata?.databricks?.approvalRequestId != null;
              const mcpServerName = part.callProviderMetadata?.databricks?.mcpServerName?.toString();

              // Extract approval outcome for 'approval-responded' state
              // When addToolApprovalResponse is called, AI SDK sets the `approval` property
              // on the tool-call part and changes state to 'approval-responded'
              const approved: boolean | undefined =
                'approval' in part ? part.approval?.approved : undefined;


              // When approved but only have approval status (not actual output), show as input-available
              const effectiveState: ToolState = (() => {
                  if (part.providerExecuted && !isLoading && state === 'input-available') {
                    return 'output-available'
                  }
                return state;
              })()
              
              // Check if the next part is text (tool output from streaming agents like Genie)
              // Only capture output for tools that stream text responses (like Genie)
              // Vega-Lite and other tools with structured output should NOT capture following text
              const isTextStreamingTool = toolName?.includes('genie') || toolName?.includes('news');
              
              let textOutputIndex = -1;
              if (isTextStreamingTool) {
                // Only capture the FIRST non-name text part after the tool (the table/direct output)
                // Skip over reasoning and name parts to find the actual tool output
                for (let i = index + 1; i < partSegments.length; i++) {
                  const checkPart = partSegments[i]?.[0];
                  
                  // Skip reasoning parts - they're displayed separately
                  if (checkPart?.type === 'reasoning') {
                    continue;
                  }
                  
                  // Found the text output!
                  if (checkPart?.type === 'text' && !isNamePart(checkPart)) {
                    textOutputIndex = i;
                    console.log('[message.tsx] Captured text output for tool:', {
                      toolName,
                      textPreview: joinMessagePartSegments(partSegments[i]).substring(0, 100),
                    });
                    break;
                  }
                  
                  // If we hit another tool before finding text, stop
                  if (checkPart?.type === 'dynamic-tool') {
                    break;
                  }
                }
              }
              
              const textOutput = textOutputIndex !== -1 
                ? joinMessagePartSegments(partSegments[textOutputIndex]) 
                : null;
              
              // Show textOutput if tool has been executed (even if state is still input-available)
              const shouldShowTextOutput = textOutput && (effectiveState === 'output-available' || part.providerExecuted);
              
              // Debug logging for text output display
              if (isTextStreamingTool) {
                console.log('[message.tsx] Text streaming tool render:', {
                  toolName,
                  hasTextOutput: !!textOutput,
                  shouldShowTextOutput,
                  effectiveState,
                  providerExecuted: part.providerExecuted,
                });
              }

              // Check if output contains a Vega-Lite spec for separate rendering
              const vegaSpec = state === 'output-available' && output 
                ? (() => {
                    const result = typeof output === 'object' || typeof output === 'string' 
                      ? parseVegaSpec(output) 
                      : null;
                    return result;
                  })()
                : null;

              // Render MCP tool calls with special styling
              if (isMcpApproval) {
                return (
                  <React.Fragment key={toolCallId}>
                    <McpTool defaultOpen={false}>
                      <McpToolHeader
                        serverName={mcpServerName}
                        toolName={toolName}
                        state={effectiveState}
                        approved={approved}
                      />
                      <McpToolContent>
                        <McpToolInput input={input} />
                        {state === 'approval-requested' && (
                          <McpApprovalActions
                            onApprove={() =>
                              submitApproval({
                                approvalRequestId: toolCallId,
                                approve: true,
                              })
                            }
                            onDeny={() =>
                              submitApproval({
                                approvalRequestId: toolCallId,
                                approve: false,
                              })
                            }
                            isSubmitting={
                              isSubmitting && pendingApprovalId === toolCallId
                            }
                          />
                        )}
                        {state === 'output-available' && output != null && !vegaSpec && (
                          <ToolOutput
                            output={output}
                            errorText={errorText}
                          />
                        )}
                        {shouldShowTextOutput && (
                          <div className="space-y-2">
                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Output</div>
                            <Response>{sanitizeText(textOutput!)}</Response>
                          </div>
                        )}
                      </McpToolContent>
                    </McpTool>
                    {vegaSpec && (
                      <div className="mt-3">
                        <VegaLiteChart spec={vegaSpec} />
                      </div>
                    )}
                  </React.Fragment>
                );
              }

              // Render regular tool calls
              return (
                <React.Fragment key={toolCallId}>
                  <Tool defaultOpen={false}>
                    <ToolHeader
                      type={toolName}
                      state={effectiveState}
                    />
                    <ToolContent>
                      <ToolInput input={input} />
                      {state === 'output-available' && output != null && !vegaSpec && (
                        <ToolOutput
                          output={output}
                          errorText={errorText}
                        />
                      )}
                      {shouldShowTextOutput && (
                        <div className="space-y-2">
                          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Output</div>
                          <Response>{sanitizeText(textOutput!)}</Response>
                        </div>
                      )}
                    </ToolContent>
                  </Tool>
                  {vegaSpec && (
                    <div className="mt-3">
                      <VegaLiteChart spec={vegaSpec} />
                    </div>
                  )}
                </React.Fragment>
              );
            }

            // Support for citations/annotations
            if (type === 'source-url') {
              return (
                <a
                  key={key}
                  href={part.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-baseline text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  <sup className="text-xs">[{part.title || part.url}]</sup>
                </a>
              );
            }

            // Render OAuth errors inline
            if (type === 'data-error' && isCredentialErrorMessage(part.data)) {
              return (
                <MessageOAuthError
                  key={key}
                  error={part.data}
                  allMessages={allMessages}
                  setMessages={setMessages}
                  sendMessage={sendMessage}
                />
              );
            }
          })}

          {!isReadonly && !hasOnlyErrors && (
            <MessageActions
              key={`action-${message.id}`}
              message={message}
              isLoading={isLoading}
              setMode={setMode}
              errorCount={errorParts.length}
              showErrors={showErrors}
              onToggleErrors={() => setShowErrors(!showErrors)}
            />
          )}

          {errorParts.length > 0 && (hasOnlyErrors || showErrors) && (
            <div className="flex flex-col gap-2">
              {errorParts.map((part, index) => (
                <MessageError
                  key={`error-${message.id}-${index}`}
                  error={part.data}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (prevProps.requiresScrollPadding !== nextProps.requiresScrollPadding)
      return false;
    if (!equal(prevProps.message.parts, nextProps.message.parts)) return false;

    return false;
  },
);

export const AwaitingResponseMessage = () => {
  const role = 'assistant';

  return (
    <div
      data-testid="message-assistant-loading"
      className="group/message w-full"
      data-role={role}
    >
      <div className="flex items-start justify-start gap-3">
        <AnimatedAssistantIcon size={14} isLoading={false} muted={true} />

        <div className="flex w-full flex-col gap-2 md:gap-4">
          <div className="p-0 text-muted-foreground text-sm">
            <LoadingText>Thinking...</LoadingText>
          </div>
        </div>
      </div>
    </div>
  );
};

const LoadingText = ({ children }: { children: React.ReactNode }) => {
  return (
    <motion.div
      animate={{ backgroundPosition: ['100% 50%', '-100% 50%'] }}
      transition={{
        duration: 1.5,
        repeat: Number.POSITIVE_INFINITY,
        ease: 'linear',
      }}
      style={{
        background:
          'linear-gradient(90deg, hsl(var(--muted-foreground)) 0%, hsl(var(--muted-foreground)) 35%, hsl(var(--foreground)) 50%, hsl(var(--muted-foreground)) 65%, hsl(var(--muted-foreground)) 100%)',
        backgroundSize: '200% 100%',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
      }}
      className="flex items-center text-transparent"
    >
      {children}
    </motion.div>
  );
};
