"use client";

import { ChatComposer } from "../components/ChatComposer";
import { ChatFeed } from "../components/ChatFeed";
import { ChatHeader } from "../components/ChatHeader";
import { ChatHistoryPanel } from "../components/ChatHistoryPanel";
import { ChatStatusIndicator } from "../components/ChatStatusIndicator";
import { formatTimestamp, useChatPage } from "../hooks/useChatPage";

export default function HomePage() {
  const {
    conversations,
    activeConversationId,
    messages,
    input,
    setInput,
    submit,
    isStreaming,
    isLoadingConversation,
    isLoadingConversations,
    isHistoryOpen,
    openHistory,
    closeHistory,
    startNewConversation,
    selectConversation,
    handleDeleteConversation,
    feedRef,
    disableInteractions,
  } = useChatPage();

  return (
    <>
      <ChatHistoryPanel
        open={isHistoryOpen}
        conversations={conversations}
        activeConversationId={activeConversationId}
        isLoading={isLoadingConversations}
        disableInteractions={disableInteractions}
        onClose={closeHistory}
        onSelectConversation={selectConversation}
        onDeleteConversation={handleDeleteConversation}
        onNewConversation={startNewConversation}
        formatTimestamp={formatTimestamp}
      />

      <main className="flex w-full max-w-[1100px] flex-col gap-6">
        <section className="flex flex-col gap-7 rounded-[26px] border border-[rgba(124,108,255,0.25)] bg-[rgba(16,21,42,0.85)] p-6 shadow-atlas-lg backdrop-blur-2xl md:p-9">
          <ChatHeader
            onOpenHistory={openHistory}
            onStartNewConversation={startNewConversation}
            disableInteractions={disableInteractions}
          />

          <ChatFeed feedRef={feedRef} messages={messages} isLoadingConversation={isLoadingConversation} />

          <ChatComposer
            input={input}
            onInputChange={(value) => setInput(value)}
            isStreaming={isStreaming}
            onSubmit={submit}
          />

          <ChatStatusIndicator
            isStreaming={isStreaming}
            hasActiveConversation={Boolean(activeConversationId && messages.length)}
          />
        </section>
      </main>
    </>
  );
}
