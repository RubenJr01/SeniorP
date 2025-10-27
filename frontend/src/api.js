import axios from "axios";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "./constants";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_TOKEN);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshRequest = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;
    if (!response) {
      return Promise.reject(error);
    }

    const isUnauthorized = response.status === 401;
    const isRetry = config?.__isRetryRequest;
    const isRefreshEndpoint = config?.url?.includes("/api/token/refresh/");

    if (!isUnauthorized || isRetry || isRefreshEndpoint) {
      return Promise.reject(error);
    }

    const storedRefresh = localStorage.getItem(REFRESH_TOKEN);
    if (!storedRefresh) {
      localStorage.removeItem(ACCESS_TOKEN);
      localStorage.removeItem(REFRESH_TOKEN);
      return Promise.reject(error);
    }

    if (!refreshRequest) {
      const refreshEndpointBase = (api.defaults.baseURL || "").replace(/\/+$/, "");
      refreshRequest = axios
        .post(
          `${refreshEndpointBase}/api/token/refresh/`,
          { refresh: storedRefresh },
        )
        .then((resp) => resp.data.access)
        .finally(() => {
          refreshRequest = null;
        });
    }

    try {
      const newAccessToken = await refreshRequest;
      if (!newAccessToken) {
        throw new Error("No access token returned.");
      }
      localStorage.setItem(ACCESS_TOKEN, newAccessToken);
      const retryConfig = {
        ...config,
        headers: {
          ...config.headers,
          Authorization: `Bearer ${newAccessToken}`,
        },
        __isRetryRequest: true,
      };
      return api(retryConfig);
    } catch (refreshError) {
      localStorage.removeItem(ACCESS_TOKEN);
      localStorage.removeItem(REFRESH_TOKEN);
      return Promise.reject(refreshError);
    }
  },
);

export default api;
