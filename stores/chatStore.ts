import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage } from '../utils/supabase'; // Assuming ChatMessage type is exported

const ASYNC_STORAGE_CHAT_KEY_PREFIX = 'chatMessages_';

interface ChatState {
  messagesByRoom: Record<string, ChatMessage[]>;
  loadingRooms: Set<string>; // To track which rooms are currently loading from storage
  initRoomMessages: (roomId: string) => Promise<void>; // Load from AsyncStorage
  setMessagesForRoom: (roomId: string, messages: ChatMessage[]) => Promise<void>; // Fetched from API
  addMessageToRoom: (roomId: string, message: ChatMessage) => Promise<void>; // New message received or sent
  updateMessageInRoom: (roomId: string, updatedMessage: ChatMessage) => Promise<void>; // For updates like pin/bookmark status
  deleteMessageInRoom: (roomId: string, messageId: string) => Promise<void>; // For message deletion
}

const useChatStore = create<ChatState>((set, get) => ({
  messagesByRoom: {},
  loadingRooms: new Set(),

  initRoomMessages: async (roomId: string) => {
    if (get().loadingRooms.has(roomId) || get().messagesByRoom[roomId]) {
      // Already loaded or currently loading, no need to re-init from storage for now
      // Or, you might want a strategy to re-check storage if app was backgrounded for long
      return;
    }
    set(state => ({ loadingRooms: new Set(state.loadingRooms).add(roomId) }));
    try {
      const storedMessages = await AsyncStorage.getItem(`${ASYNC_STORAGE_CHAT_KEY_PREFIX}${roomId}`);
      if (storedMessages) {
        const parsedMessages: ChatMessage[] = JSON.parse(storedMessages);
        // Sort messages by timestamp (newest first for rendering, as in original component)
        const sortedMessages = [...parsedMessages].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        set(state => ({
          messagesByRoom: {
            ...state.messagesByRoom,
            [roomId]: sortedMessages,
          },
        }));
      }
    } catch (error) {
      console.error(`Failed to load messages for room ${roomId} from AsyncStorage:`, error);
    } finally {
      set(state => {
        const newLoadingRooms = new Set(state.loadingRooms);
        newLoadingRooms.delete(roomId);
        return { loadingRooms: newLoadingRooms };
      });
    }
  },

  setMessagesForRoom: async (roomId: string, messages: ChatMessage[]) => {
    // This function is called when fresh messages are fetched from the API.
    // It replaces the existing messages for the room.
    const sortedMessages = [...messages].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    set(state => ({
      messagesByRoom: {
        ...state.messagesByRoom,
        [roomId]: sortedMessages,
      },
    }));
    try {
      await AsyncStorage.setItem(`${ASYNC_STORAGE_CHAT_KEY_PREFIX}${roomId}`, JSON.stringify(sortedMessages));
    } catch (error) {
      console.error(`Failed to save messages for room ${roomId} to AsyncStorage:`, error);
    }
  },

  addMessageToRoom: async (roomId: string, message: ChatMessage) => {
    const currentMessages = get().messagesByRoom[roomId] || [];
    // Add new message to the beginning (as list is inverted or newest first)
    const updatedMessages = [message, ...currentMessages]; 
    
    // Optional: Maintain a max number of messages in cache to prevent excessive storage use
    // const MAX_CACHED_MESSAGES = 200;
    // if ((updatedMessages?.length || 0) > MAX_CACHED_MESSAGES) {
    //   updatedMessages.splice(MAX_CACHED_MESSAGES);
    // }

    set(state => ({
      messagesByRoom: {
        ...state.messagesByRoom,
        [roomId]: updatedMessages,
      },
    }));
    try {
      await AsyncStorage.setItem(`${ASYNC_STORAGE_CHAT_KEY_PREFIX}${roomId}`, JSON.stringify(updatedMessages));
    } catch (error) {
      console.error(`Failed to update messages for room ${roomId} in AsyncStorage:`, error);
    }
  },

  updateMessageInRoom: async (roomId: string, updatedMessage: ChatMessage) => {
    const currentMessages = get().messagesByRoom[roomId] || [];
    const messageIndex = currentMessages.findIndex(msg => msg.id === updatedMessage.id);

    if (messageIndex !== -1) {
      const updatedMessages = [...currentMessages];
      updatedMessages[messageIndex] = updatedMessage;
      
      set(state => ({
        messagesByRoom: {
          ...state.messagesByRoom,
          [roomId]: updatedMessages,
        },
      }));
      try {
        await AsyncStorage.setItem(`${ASYNC_STORAGE_CHAT_KEY_PREFIX}${roomId}`, JSON.stringify(updatedMessages));
      } catch (error) {
        console.error(`Failed to update message in room ${roomId} in AsyncStorage:`, error);
      }
    }
  },

  deleteMessageInRoom: async (roomId: string, messageId: string) => {
    const currentMessages = get().messagesByRoom[roomId] || [];
    const updatedMessages = currentMessages.filter(msg => msg.id !== messageId);

    if ((updatedMessages?.length || 0) !== (currentMessages?.length || 0)) {
      set(state => ({
        messagesByRoom: {
          ...state.messagesByRoom,
          [roomId]: updatedMessages,
        },
      }));
      try {
        await AsyncStorage.setItem(`${ASYNC_STORAGE_CHAT_KEY_PREFIX}${roomId}`, JSON.stringify(updatedMessages));
      } catch (error) {
        console.error(`Failed to delete message in room ${roomId} in AsyncStorage:`, error);
      }
    }
  },
}));

export default useChatStore; 