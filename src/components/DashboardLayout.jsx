
const DashboardLayout = ({ children }) => {
    return (
        <div className="w-full">
            {/* Content - No separate header needed, it's in Sidebar now */}
            <div>
                {children}
            </div>
        </div>
    );
};

export default DashboardLayout;
