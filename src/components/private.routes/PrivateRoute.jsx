import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

const PrivateRoutes = () => {
  const { user, loading } = useAuth();

  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-800"></div>

        <div className="text-lg font-semibold text-slate-700">
          Checking authentication...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
};

export default PrivateRoutes;
