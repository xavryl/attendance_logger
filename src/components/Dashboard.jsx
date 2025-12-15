import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, query } from "firebase/firestore";
import "../App.css";

// --- HELPER: Convert "14:5" to "02:05 PM" safely ---
const formatTo12Hour = (militaryTime) => {
  if (!militaryTime) return { full: "--:--", hour: "", minute: "", ampm: "" };
  
  const [hours, minutes] = militaryTime.split(":");
  const h = parseInt(hours, 10);
  const m = parseInt(minutes, 10);

  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12; 
  
  // Ensure we always have 2 digits (e.g., 5 becomes "05")
  const hourStr = h12.toString().padStart(2, "0");
  const minStr = m.toString().padStart(2, "0");

  return {
    full: `${h12}:${minStr} ${ampm}`,
    hour: hourStr,    // "08"
    minute: minStr,   // "05"
    ampm: ampm        // "PM"
  };
};

const Dashboard = () => {
  const [logs, setLogs] = useState([]);
  const [students, setStudents] = useState({});
  
  // --- Filter States ---
  const [filterText, setFilterText] = useState(""); // Search Name OR RFID
  const [filterDate, setFilterDate] = useState("");
  
  // Time Dropdowns
  const [selHour, setSelHour] = useState("");
  const [selMin, setSelMin] = useState("");
  const [selAmPm, setSelAmPm] = useState("");

  // 1. Fetch Students (Registry)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "students"), (snapshot) => {
      const studentMap = {};
      snapshot.forEach((doc) => {
        studentMap[doc.data().rfid] = doc.data().name; 
      });
      setStudents(studentMap);
    });
    return () => unsub();
  }, []);

  // 2. Fetch Attendance Logs (History)
  useEffect(() => {
    const q = query(collection(db, "attendance"));
    const unsub = onSnapshot(q, (snapshot) => {
      const fetchedLogs = snapshot.docs.map(doc => {
        const data = doc.data();
        // Convert time once when fetching
        const timeData = formatTo12Hour(data.time);
        return {
          id: doc.id,
          ...data,
          displayTime: timeData.full,
          hourPart: timeData.hour,
          minPart: timeData.minute,
          ampmPart: timeData.ampm
        };
      });
      
      // Sort: Newest First
      fetchedLogs.sort((a, b) => {
          const timeA = new Date(`${a.date}T${a.time}`);
          const timeB = new Date(`${b.date}T${b.time}`);
          return timeB - timeA; 
      });

      setLogs(fetchedLogs);
    });
    return () => unsub();
  }, []);

  // 3. FILTER LOGIC
  const filteredLogs = logs.filter((log) => {
    // A. Text Search (Name OR RFID)
    const studentName = (students[log.rfid] || "").toLowerCase();
    const rfidLower = log.rfid.toLowerCase();
    const searchText = filterText.toLowerCase();
    const matchesText = studentName.includes(searchText) || rfidLower.includes(searchText);

    // B. Date Filter
    const matchesDate = filterDate ? log.date === filterDate : true;

    // C. Time Filters
    // Only filter if the user has actually selected a value in the dropdown
    const matchesHour = selHour ? log.hourPart === selHour : true;
    const matchesMin  = selMin  ? log.minPart === selMin  : true;
    const matchesAmPm = selAmPm ? log.ampmPart === selAmPm : true;

    return matchesText && matchesDate && matchesHour && matchesMin && matchesAmPm;
  });

  // --- Quick Actions ---
  const setToday = () => {
    const today = new Date().toISOString().split('T')[0];
    setFilterDate(today);
  };

  const clearFilters = () => {
    setFilterText("");
    setFilterDate("");
    setSelHour("");
    setSelMin("");
    setSelAmPm("");
  };

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1>Attendance Dashboard</h1>
          <p>Real-time monitoring system</p>
        </div>
        <div className="stats-badge">
          Records Found: {filteredLogs.length}
        </div>
      </div>

      {/* Filter Card */}
      <div className="filter-card">
        
        {/* Name/RFID Search */}
        <div className="filter-group">
          <label>Search Name or RFID</label>
          <input 
            type="text" 
            placeholder="e.g. Charles or 917DC..." 
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
        </div>

        {/* Date Filter */}
        <div className="filter-group">
          <label>Filter Date</label>
          <div className="date-input-wrapper">
            <button onClick={setToday} className="btn-small">Today</button>
            <input 
              type="date" 
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </div>
        </div>

        {/* Time Filter (3 Parts) */}
        <div className="filter-group">
          <label>Time (12h)</label>
          <div className="time-select-wrapper">
            {/* Hour */}
            <select value={selHour} onChange={e => setSelHour(e.target.value)}>
              <option value="">Hr</option>
              {Array.from({length: 12}, (_, i) => {
                const val = (i+1).toString().padStart(2,'0');
                return <option key={val} value={val}>{val}</option>;
              })}
            </select>

            {/* Minute */}
            <select value={selMin} onChange={e => setSelMin(e.target.value)}>
              <option value="">Min</option>
              {[0,5,10,15,20,25,30,35,40,45,50,55].map(m => {
                const val = m.toString().padStart(2,'0');
                return <option key={val} value={val}>{val}</option>;
              })}
            </select>

            {/* AM/PM */}
            <select value={selAmPm} onChange={e => setSelAmPm(e.target.value)}>
              <option value="">--</option>
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
        </div>

        {/* Reset Button */}
        <div className="filter-actions">
          <button onClick={clearFilters} className="btn-reset">
            Reset All
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Student Name</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log) => {
                const name = students[log.rfid];
                const isUnknown = !name || name.trim() === "";

                return (
                  <tr key={log.id}>
                    <td>{log.date}</td>
                    <td><span className="time-badge">{log.displayTime}</span></td>
                    <td>
                      {isUnknown ? (
                        <div className="user-info unknown">
                          <span className="name">Unregistered</span>
                          <span className="rfid">{log.rfid}</span>
                        </div>
                      ) : (
                        <div className="user-info registered">
                          <span className="name">{name}</span>
                          <span className="rfid">{log.rfid}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`status-pill ${isUnknown ? "status-error" : "status-success"}`}>
                        {isUnknown ? "Missing Info" : "Present"}
                      </span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="4" className="empty-state">
                  No logs found. Try clearing filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Dashboard;