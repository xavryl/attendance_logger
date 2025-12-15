import React from "react";
import { Routes, Route, Link } from "react-router-dom"; // Import Router tools
import SyncService from "./components/SyncService";
import Dashboard from "./components/Dashboard";
import Registration from "./components/Registration";
import "./App.css";

function App() {
  return (
    <div className="app-container">
      {/* SyncService runs globally on EVERY page. 
        This ensures scans are recorded even if you are on the Register page.
      */}
      <SyncService />

      <Routes>
        {/* Route 1: The Dashboard (Home) */}
        <Route path="/" element={<Dashboard />} />
        
        {/* Route 2: The Student Kiosk */}
        <Route path="/register" element={<Registration />} />
      </Routes>

      {/* Optional: A hidden navigation footer just for you to switch easily */}
      <div style={{ position: "fixed", bottom: 10, right: 10, opacity: 0.5 }}>
         <Link to="/" style={{ marginRight: 10 }}>Admin</Link> | 
         <Link to="/register" style={{ marginLeft: 10 }}>Kiosk</Link>
      </div>
    </div>
  );
}

export default App;