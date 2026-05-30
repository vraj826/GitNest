import { create } from "zustand";
import { persist } from "zustand/middleware";
import { loginUser, registerUser, getMe } from "../api/authApi";

const extractUserData = (responseData) => {
  const payload = responseData?.data ?? responseData;

  if (!payload) {
    return null;
  }

  const { _id, username, email, token } = payload;
  return { _id, username, email, token };
};

const extractErrorMessage = (error) => {
  if (error?.errors && Array.isArray(error.errors) && error.errors.length > 0) {
    return error.errors.map((err) => err.message).join(", ");
  }
  return error?.message || "An error occurred";
};

export const useAuthStore = create(
  persist(
    (set) => ({
      // state
      user: null,
      token: null,
      isAuthenticated: false,
      loading: false,
      error: null,

      // login
      login: async (email, password) => {
        set({
          loading: true,
          error: null,
        });

        try {
          const res = await loginUser({
            email,
            password,
          });
          const userData = extractUserData(res);
          set({
            user: {
              _id: userData._id,
              username: userData.username,
              email: userData.email,
            },
            token: userData.token,
            isAuthenticated: true,
            error: null,
          });

          return userData;
        } catch (error) {
          set({
            error: extractErrorMessage(error),
          });

          throw error;
        } finally {
          set({
            loading: false,
          });
        }
      },

      // register
      register: async (userData) => {
        set({
          loading: true,
          error: null,
        });

        try {
          const res = await registerUser(userData);
          const createdUser = extractUserData(res);
          set({
            user: {
              _id: createdUser._id,
              username: createdUser.username,
              email: createdUser.email,
            },
            token: createdUser.token,
            isAuthenticated: true,
            error: null,
          });
          return createdUser;
        } catch (error) {
          set({
            error: extractErrorMessage(error),
          });

          throw error;
        } finally {
          set({
            loading: false,
          });
        }
      },

      // logout
      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
          loading: false,
        });
      },

      // clear error
      clearError: () => {
        set({
          error: null,
        });
      },

      // check auth
      checkAuth: async () => {
        set({
          loading: true,
          error: null,
        });

        try {
          const res = await getMe();

          set({
            user: res,
            isAuthenticated: true,
          });
        } catch {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
          });
        } finally {
          set({
            loading: false,
          });
        }
      },
    }),
    {
      name: "auth-storage",

      // persist only required state
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
