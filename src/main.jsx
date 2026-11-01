import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import routers from "./routes/Routes";
import { AuthProvider } from "./auth/AuthContext";
import "./index.css";
import { SocketProvider } from "./hooks/socketProvider/SocketContext";
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <SocketProvider>
        <RouterProvider router={routers} />
      </SocketProvider>
    </AuthProvider>
  </React.StrictMode>,
);
