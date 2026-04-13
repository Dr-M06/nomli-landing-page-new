import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Message, Conversation } from '../../utils/chat';
import { ChatMessage } from '../../utils/countryChat';
import { log, warn, error } from '../../utils/productionLogger';


interface ChatStoreState {
  // Private Messages
  privateMessages: Record<string, Message[]>;
  conversations: Conversation[];
  lastFetched: Record<string, number>;
  
  // Country Chat Messages
  countryChatMessages: Record<string, ChatMessage[]>;
  countryChatLastFetched: Record<string, number>;
  
  // Deleted Conversations Tracking
  deletedConversationIds: string[];
  
  // Actions
  setPrivateMessages: (userId: string, messages: Message[]) => void;
  addPrivateMessage: (message: Message) => void;
  setConversations: (conversations: Conversation[]) => void;
  updateConversation: (conversation: Conversation) => void;
  
  // Unread count management
  updateUnreadCount: (conversationId: string, unreadCount: number) => void;
  
  // Deleted conversations actions
  markConversationAsDeleted: (conversationId: string) => void;
  isConversationDeleted: (conversationId: string) => boolean;
  getFilteredConversations: () => Conversation[];
  
  setCountryChatMessages: (roomId: string, messages: ChatMessage[]) => void;
  addCountryChatMessage: (roomId: string, message: ChatMessage) => void;
  
        // Cache management
      clearCache: () => void;
      clearUserCache: (userId: string) => void;
      clearRoomCache: (roomId: string) => void;
      clearConversationCache: (conversationId: string) => void;
}

export const useChatStore = create<ChatStoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      privateMessages: {},
      conversations: [],
      lastFetched: {},
      countryChatMessages: {},
      countryChatLastFetched: {},
      deletedConversationIds: [],
      
      // Private Messages Actions
      setPrivateMessages: (userId: string, messages: Message[]) => {
        set((state) => ({
          privateMessages: {
            ...state.privateMessages,
            [userId]: messages,
          },
          lastFetched: {
            ...state.lastFetched,
            [userId]: Date.now(),
          },
        }));
      },
      
      addPrivateMessage: (message: Message) => {
        set((state) => {
          const userId = message.sender_id === message.recipient_id 
            ? message.recipient_id 
            : message.sender_id;
            
          const existingMessages = state.privateMessages[userId] || [];
          
          // Check if message already exists
          const messageExists = existingMessages.some(m => m.id === message.id);
          if (messageExists) return state;
          
          return {
            privateMessages: {
              ...state.privateMessages,
              [userId]: [message, ...existingMessages],
            },
          };
        });
      },
      
      setConversations: (conversations: Conversation[]) => {
        set({ conversations });
      },
      
      updateConversation: (conversation: Conversation) => {
        set((state) => {
          const existingIndex = state.conversations.findIndex(
            c => c.conversation_with === conversation.conversation_with
          );
          
          if (existingIndex === -1) {
            log('[Chat Store] Adding new conversation:', conversation.conversation_with);
            return {
              conversations: [conversation, ...state.conversations],
            };
          }
          
          const updatedConversations = [...state.conversations];
          // Merge with existing conversation data to preserve fields like avatar, name, etc.
          const existingConversation = updatedConversations[existingIndex];
          
          log('[Chat Store] Updating conversation:', {
            partnerId: conversation.conversation_with,
            oldAvatar: existingConversation.conversation_with_avatar,
            newAvatar: conversation.conversation_with_avatar,
            oldName: existingConversation.conversation_with_name,
            newName: conversation.conversation_with_name,
            oldSnippet: existingConversation.last_message_content,
            newSnippet: conversation.last_message_content
          });
          
          updatedConversations[existingIndex] = {
            ...existingConversation,
            ...conversation,
            // Ensure we don't lose important fields
            conversation_with_avatar: conversation.conversation_with_avatar || existingConversation.conversation_with_avatar,
            conversation_with_name: conversation.conversation_with_name || existingConversation.conversation_with_name,
          };
          
          log('[Chat Store] Final conversation state:', {
            partnerId: conversation.conversation_with,
            finalAvatar: updatedConversations[existingIndex].conversation_with_avatar,
            finalName: updatedConversations[existingIndex].conversation_with_name,
            finalSnippet: updatedConversations[existingIndex].last_message_content
          });
          
          return { conversations: updatedConversations };
        });
      },
      
      updateUnreadCount: (conversationId: string, unreadCount: number) => {
        set((state) => {
          const existingIndex = state.conversations.findIndex(
            c => c.conversation_with === conversationId
          );
          
          if (existingIndex === -1) {
            log('[Chat Store] Cannot update unread count: conversation not found:', conversationId);
            return state;
          }
          
          const updatedConversations = [...state.conversations];
          updatedConversations[existingIndex] = {
            ...updatedConversations[existingIndex],
            unread_count: unreadCount
          };
          
          log('[Chat Store] Updated unread count for conversation:', {
            conversationId,
            oldCount: state.conversations[existingIndex].unread_count,
            newCount: unreadCount
          });
          
          return { conversations: updatedConversations };
        });
      },
      
      // Deleted conversations actions
      markConversationAsDeleted: (conversationId: string) => {
        set((state) => {
          // Check if already in deleted list to avoid duplicates
          if (state.deletedConversationIds.includes(conversationId)) {
            return state;
          }
          
          log(`[Chat Store] Marking conversation ${conversationId} as deleted`);
          return {
            deletedConversationIds: [...state.deletedConversationIds, conversationId]
          };
        });
      },
      
      isConversationDeleted: (conversationId: string) => {
        return get().deletedConversationIds.includes(conversationId);
      },
      
      getFilteredConversations: () => {
        const { conversations, deletedConversationIds } = get();
        return conversations.filter(
          (conv) => !deletedConversationIds.includes(conv.conversation_with)
        );
      },
      
      // Country Chat Actions
      setCountryChatMessages: (roomId: string, messages: ChatMessage[]) => {
        set((state) => {
          // Make a deep copy of the messages to avoid reference issues
          const messagesCopy = JSON.parse(JSON.stringify(messages));
          
          // Ensure messages are unique by ID to prevent duplicates in store
          const uniqueMessages = messagesCopy.filter((msg, index, self) => 
            index === self.findIndex(m => m.id === msg.id)
          );
          
          if (uniqueMessages.length !== messagesCopy.length) {
            log(`[ChatStore] Removed ${messagesCopy.length - uniqueMessages.length} duplicate messages before storing`);
          }
          
          log(`[ChatStore] Setting ${uniqueMessages.length} unique messages for room ${roomId}`);
          
          return {
          countryChatMessages: {
            ...state.countryChatMessages,
              [roomId]: uniqueMessages,
          },
          countryChatLastFetched: {
            ...state.countryChatLastFetched,
            [roomId]: Date.now(),
          },
          };
        });
      },
      
      addCountryChatMessage: (roomId: string, message: ChatMessage) => {
        set((state) => {
          // Get existing messages, making sure it's a valid array
          const existingMessages = Array.isArray(state.countryChatMessages[roomId]) 
            ? state.countryChatMessages[roomId] 
            : [];
          
          // Check if message already exists
          const messageExists = existingMessages.some(m => m.id === message.id);
          if (messageExists) return state;
          
          // Create a deep copy of existing messages to avoid reference issues
          const existingMessagesCopy = JSON.parse(JSON.stringify(existingMessages));
          
          // Ensure we're properly preserving all existing messages
          const updatedMessages = [message, ...existingMessagesCopy];
          
          log(`[ChatStore] Adding message ${message.id} to room ${roomId}. Total messages: ${updatedMessages.length}`);
          
          return {
            countryChatMessages: {
              ...state.countryChatMessages,
              [roomId]: updatedMessages,
            },
            countryChatLastFetched: {
              ...state.countryChatLastFetched,
              [roomId]: Date.now(), // Update the last fetched timestamp
            }
          };
        });
      },
      
      // Cache Management
      clearCache: () => {
        set({
          privateMessages: {},
          conversations: [],
          lastFetched: {},
          countryChatMessages: {},
          countryChatLastFetched: {},
        });
      },
      
      clearUserCache: (userId: string) => {
        set((state) => {
          const { [userId]: removedMessages, ...remainingMessages } = state.privateMessages;
          const { [userId]: removedTimestamp, ...remainingTimestamps } = state.lastFetched;
          
          return {
            privateMessages: remainingMessages,
            lastFetched: remainingTimestamps,
          };
        });
      },
      
      clearRoomCache: (roomId: string) => {
        set((state) => {
          const { [roomId]: removedMessages, ...remainingMessages } = state.countryChatMessages;
          const { [roomId]: removedTimestamp, ...remainingTimestamps } = state.countryChatLastFetched;
          
          return {
            countryChatMessages: remainingMessages,
            countryChatLastFetched: remainingTimestamps,
          };
        });
      },
      
      clearConversationCache: (conversationId: string) => {
        log('🔍 [CHAT STORE DEBUG] Clearing conversation cache for:', conversationId);
        set((state) => {
          const { [conversationId]: removedMessages, ...remainingMessages } = state.privateMessages;
          const { [conversationId]: removedTimestamp, ...remainingTimestamps } = state.lastFetched;
          
          log('🔍 [CHAT STORE DEBUG] Conversation cache cleared for:', conversationId);
          
          return {
            privateMessages: remainingMessages,
            lastFetched: remainingTimestamps,
          };
        });
      },
    }),
    {
      name: 'chat-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        privateMessages: state.privateMessages,
        conversations: state.conversations,
        countryChatMessages: state.countryChatMessages,
        deletedConversationIds: state.deletedConversationIds,
      }),
    }
  )
);

export default useChatStore;