// src/components/Dashboard.jsx
import React, { useEffect, useState, useRef } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, query } from "firebase/firestore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs"; 
import { saveAs } from "file-saver"; 
import "../App.css";

// --- HELPER: Time Formatting ---
const formatTo12Hour = (militaryTime) => {
  if (!militaryTime) return { full: "--:--", hour: "", minute: "", ampm: "" };
  const [hours, minutes] = militaryTime.split(":");
  const h = parseInt(hours, 10);
  const m = parseInt(minutes, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12; 
  return {
    full: `${h12}:${m.toString().padStart(2, "0")} ${ampm}`,
    hour: h12.toString().padStart(2, "0"),
    minute: m.toString().padStart(2, "0"),
    ampm: ampm
  };
};

const formatDateLabel = (dateStr) => {
  if (!dateStr) return "";
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(dateStr).toLocaleDateString('en-US', options);
};

const getMinutesFromMidnight = (hourStr, minuteStr, ampm) => {
  let h = parseInt(hourStr, 10);
  const m = parseInt(minuteStr, 10);
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return (h * 60) + m;
};

// --- COMPONENT: Vertical Time Stepper ---
const TimeStepper = ({ value, options, onChange, type = "number" }) => {
  const handleStep = (direction) => {
    const currentIndex = options.indexOf(value);
    let newIndex;
    if (direction === 'up') newIndex = (currentIndex + 1) % options.length;
    else newIndex = (currentIndex - 1 + options.length) % options.length;
    onChange(options[newIndex]);
  };

  return (
    <div className="time-stepper">
      <button className="step-btn" onClick={() => handleStep('up')} type="button" tabIndex="-1">▲</button>
      <div className="select-wrapper">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={`stepper-select ${type === 'ampm' ? 'text-ampm' : ''}`}>
          {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>
      <button className="step-btn" onClick={() => handleStep('down')} type="button" tabIndex="-1">▼</button>
    </div>
  );
};

const Dashboard = () => {
  const [logs, setLogs] = useState([]);
  const [students, setStudents] = useState({}); 
  const [studentsArray, setStudentsArray] = useState([]); 

  // --- DASHBOARD FILTERS ---
  const [filterText, setFilterText] = useState("");
  const [searchMode, setSearchMode] = useState("all"); // 'all', 'firstName', 'lastName'
  const [filterDate, setFilterDate] = useState(""); 
  const [selHour, setSelHour] = useState("");
  const [selMin, setSelMin] = useState("");
  const [selAmPm, setSelAmPm] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // --- EXPORT MODAL STATE ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [exportError, setExportError] = useState("");
  const [availableDates, setAvailableDates] = useState([]); 
  const [selectedExportDates, setSelectedExportDates] = useState([]); 
  const [dateSearchText, setDateSearchText] = useState("");
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [exportNameSearch, setExportNameSearch] = useState("");
  const [selectedStudentRfid, setSelectedStudentRfid] = useState(null); 
  const [showNameDropdown, setShowNameDropdown] = useState(false);
  const [isTimeFilterEnabled, setIsTimeFilterEnabled] = useState(false);

  // Time Filter State
  const [expStartHour, setExpStartHour] = useState("08");
  const [expStartMin, setExpStartMin]   = useState("00");
  const [expStartAmPm, setExpStartAmPm] = useState("AM");
  const [expEndHour, setExpEndHour]     = useState("05");
  const [expEndMin, setExpEndMin]       = useState("00");
  const [expEndAmPm, setExpEndAmPm]     = useState("PM");

  const hoursArr = Array.from({length: 12}, (_, i) => (i+1).toString().padStart(2,'0'));
  const minsArr = [0,5,10,15,20,25,30,35,40,45,50,55].map(m => m.toString().padStart(2,'0'));
  const ampmArr = ["AM", "PM"];

  const dateWrapperRef = useRef(null);
  const nameWrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dateWrapperRef.current && !dateWrapperRef.current.contains(event.target)) setShowDateDropdown(false);
      if (nameWrapperRef.current && !nameWrapperRef.current.contains(event.target)) setShowNameDropdown(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- 1. HELPER: DYNAMIC NAME FORMATTER ---
  const getFormattedName = (student, mode) => {
    if (!student) return "Unregistered";
    
    // Check if we have split data
    if (student.firstName && student.lastName) {
        if (mode === 'firstName') {
            // Format: First Middle Last
            return `${student.firstName} ${student.middleName || ""} ${student.lastName}`.replace(/\s+/g, " ").trim();
        } else {
            // Format: Last, First Middle (Default for 'all' and 'lastName')
            return `${student.lastName}, ${student.firstName} ${student.middleName || ""}`.trim();
        }
    }
    
    // Fallback for old data
    return student.formatted || "Unknown";
  };

  // --- 2. STUDENT FETCH ---
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "students"), (snapshot) => {
      const studentMap = {};
      const arr = [];
      snapshot.forEach((doc) => {
        const d = doc.data();
        
        // Prepare default string for search array
        let defaultStr = "";
        if (d.lastName && d.firstName) {
            defaultStr = `${d.lastName}, ${d.firstName} ${d.middleName || ""}`.trim();
        } else {
            defaultStr = d.name || "";
        }

        studentMap[d.rfid] = {
            firstName: d.firstName || "",
            middleName: d.middleName || "",
            lastName: d.lastName || "",
            formatted: defaultStr // Backup string
        };

        if(defaultStr) arr.push({ rfid: d.rfid, name: defaultStr });
      });
      setStudents(studentMap);
      setStudentsArray(arr);
    });
    return () => unsub();
  }, []);

  // --- 3. LOGS FETCH ---
  useEffect(() => {
    const q = query(collection(db, "attendance"));
    const unsub = onSnapshot(q, (snapshot) => {
      const fetchedLogs = snapshot.docs.map(doc => {
        const data = doc.data();
        const timeData = formatTo12Hour(data.time);
        return {
          id: doc.id,
          ...data,
          displayTime: timeData.full,
          hourPart: timeData.hour,
          minPart: timeData.minute,
          ampmPart: timeData.ampm,
          rawHour: parseInt(data.time.split(':')[0], 10),
          rawMin: parseInt(data.time.split(':')[1], 10),
          fullDateObj: new Date(`${data.date}T${data.time}`)
        };
      });
      fetchedLogs.sort((a, b) => b.fullDateObj - a.fullDateObj);
      setLogs(fetchedLogs);
      const unique = [...new Set(fetchedLogs.map(l => l.date))];
      unique.sort((a, b) => new Date(b) - new Date(a));
      setAvailableDates(unique);
    });
    return () => unsub();
  }, []);

  // --- DASHBOARD FILTER LOGIC ---
  const filteredLogs = logs.filter((log) => {
    const student = students[log.rfid];
    const searchText = filterText.toLowerCase();
    const rfidLower = log.rfid.toLowerCase();

    let matchesText = false;

    if (!student) {
        matchesText = rfidLower.includes(searchText);
    } else {
        if (searchMode === 'firstName') {
            matchesText = student.firstName.toLowerCase().includes(searchText);
        } else if (searchMode === 'lastName') {
            matchesText = student.lastName.toLowerCase().includes(searchText);
        } else {
            matchesText = student.formatted.toLowerCase().includes(searchText) || rfidLower.includes(searchText);
        }
    }

    const matchesDate = filterDate ? log.date === filterDate : true;
    const matchesHour = selHour ? log.hourPart === selHour : true;
    const matchesMin  = selMin  ? log.minPart === selMin  : true;
    const matchesAmPm = selAmPm ? log.ampmPart === selAmPm : true;
    
    return matchesText && matchesDate && matchesHour && matchesMin && matchesAmPm;
  });

  const sortedDashboardLogs = [...filteredLogs].sort((a, b) => {
    const studentA = students[a.rfid];
    const studentB = students[b.rfid];
    // We sort based on what is currently displayed (using getFormattedName)
    const nameA = getFormattedName(studentA, searchMode).toLowerCase();
    const nameB = getFormattedName(studentB, searchMode).toLowerCase();
    
    switch (sortBy) {
      case "name_asc": return nameA.localeCompare(nameB);
      case "name_desc": return nameB.localeCompare(nameA);
      case "oldest": return a.fullDateObj - b.fullDateObj;
      case "newest": default: return b.fullDateObj - a.fullDateObj;
    }
  });

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = sortedDashboardLogs.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(sortedDashboardLogs.length / itemsPerPage);
  const handlePageChange = (newPage) => { if (newPage >= 1 && newPage <= totalPages) setCurrentPage(newPage); };

  // Export Logic
  const filteredDateList = availableDates.filter(d => formatDateLabel(d).toLowerCase().includes(dateSearchText.toLowerCase()));
  const toggleDateSelection = (dateStr) => {
    if (selectedExportDates.includes(dateStr)) setSelectedExportDates(selectedExportDates.filter(d => d !== dateStr));
    else setSelectedExportDates([...selectedExportDates, dateStr]);
  };
  const filteredStudentsList = studentsArray.filter(s => s.name.toLowerCase().includes(exportNameSearch.toLowerCase()));
  const handleNameSelect = (student) => {
    setExportNameSearch(student.name);
    setSelectedStudentRfid(student.rfid);
    setShowNameDropdown(false);
  };
  const handleNameInputChange = (e) => {
    setExportNameSearch(e.target.value);
    setSelectedStudentRfid(null); 
    setShowNameDropdown(true);
  };

  const handleExport = async (type) => {
    setExportError("");

    if (selectedExportDates.length === 0) {
      setExportError("Please select at least one date.");
      return;
    }

    let startMinutes = 0;
    let endMinutes = 1440; 

    if (isTimeFilterEnabled) {
        startMinutes = getMinutesFromMidnight(expStartHour, expStartMin, expStartAmPm);
        endMinutes = getMinutesFromMidnight(expEndHour, expEndMin, expEndAmPm);

        if (startMinutes > endMinutes) {
          setExportError("Start time cannot be after End time.");
          return;
        }
    }

    const exportData = logs.filter(log => {
      if (!selectedExportDates.includes(log.date)) return false;
      const logMinutes = (log.rawHour * 60) + log.rawMin;
      if (logMinutes < startMinutes || logMinutes > endMinutes) return false;
      
      if (selectedStudentRfid) {
        if (log.rfid !== selectedStudentRfid) return false;
      } 
      else if (exportNameSearch.trim() !== "") {
        const sName = students[log.rfid] ? students[log.rfid].formatted : "";
        if (!sName.toLowerCase().includes(exportNameSearch.toLowerCase().trim())) return false;
      }
      return true;
    });

    if (exportData.length === 0) {
      setExportError("No logs found matching your filters.");
      return;
    }
    
    exportData.sort((a, b) => b.fullDateObj - a.fullDateObj);

    // Map data using the dynamic formatter
    const mapLogToRow = (log) => {
      const student = students[log.rfid];
      // Dynamic Name based on Search Mode
      const name = getFormattedName(student, searchMode);
      
      // Strict Check for "Missing Info" (Must have First AND Last name in DB to be valid)
      const hasValidInfo = student && student.firstName && student.lastName;
      const status = hasValidInfo ? "Present" : "Missing Info";
      
      return { date: log.date, time: log.displayTime, rfid: log.rfid, name, status };
    };

    if (type === 'excel' || type === 'csv') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Attendance");
      worksheet.columns = [
        { header: "Date", key: "date", width: 15 },
        { header: "Time", key: "time", width: 15 },
        { header: "RFID", key: "rfid", width: 20 },
        { header: "Name", key: "name", width: 30 },
        { header: "Status", key: "status", width: 20 },
      ];
      worksheet.addRows(exportData.map(mapLogToRow));
      worksheet.getRow(1).font = { bold: true };
      const buffer = await workbook.xlsx.writeBuffer();
      
      if (type === 'excel') {
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        saveAs(blob, `attendance_export.xlsx`);
      } else {
        const headers = ["Date", "Time", "RFID", "Name", "Status"];
        const csvRows = exportData.map(log => {
           const r = mapLogToRow(log);
           return [r.date, r.time, r.rfid, r.name, r.status];
        });
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...csvRows.map(e => e.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `attendance_export.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } else if (type === 'pdf') {
        const doc = new jsPDF();
        doc.text("Attendance Report", 14, 20);
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
        
        let timeRangeStr = "All Day";
        if(isTimeFilterEnabled) timeRangeStr = `${expStartHour}:${expStartMin} ${expStartAmPm} - ${expEndHour}:${expEndMin} ${expEndAmPm}`;

        doc.text(`Time Range: ${timeRangeStr}`, 14, 35);
        doc.text(`Dates Selected: ${selectedExportDates.length}`, 14, 40);
        if(exportNameSearch) doc.text(`Name Filter: "${exportNameSearch}"`, 14, 45);
        
        const tableColumn = ["Date", "Time", "RFID", "Name", "Status"];
        const tableRows = exportData.map(log => {
           const r = mapLogToRow(log);
           return [r.date, r.time, r.rfid, r.name, r.status];
        });
        autoTable(doc, { startY: 50, head: [tableColumn], body: tableRows });
        doc.save(`attendance_report.pdf`);
    }

    setIsModalOpen(false); 
    setExportError("");
  };

  const setToday = () => { setFilterDate(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })); setCurrentPage(1); };
  const clearFilters = () => { setFilterText(""); setSearchMode("all"); setFilterDate(""); setSelHour(""); setSelMin(""); setSelAmPm(""); setSortBy("newest"); setCurrentPage(1); };
  const handleFilterChange = (setter, value) => { setter(value); setCurrentPage(1); };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div><h1>Attendance Dashboard</h1><p>Real-time monitoring system</p></div>
        <div className="export-container">
           <button onClick={() => { setIsModalOpen(true); setExportError(""); }} className="btn-main-export">📥 Export Data</button>
        </div>
      </div>

      <div className="filter-card">
        {/* --- BUTTON FILTER FOR SEARCH --- */}
        <div className="filter-group" style={{ flex: 1.5 }}>
            <label>Search Student</label>
            
            <div className="search-buttons-container">
               <button 
                 onClick={() => { setSearchMode('all'); setCurrentPage(1); }} 
                 className={`search-btn ${searchMode === 'all' ? 'active' : ''}`}
               >All</button>
               <button 
                 onClick={() => { setSearchMode('firstName'); setCurrentPage(1); }} 
                 className={`search-btn ${searchMode === 'firstName' ? 'active' : ''}`}
               >First Name</button>
               <button 
                 onClick={() => { setSearchMode('lastName'); setCurrentPage(1); }} 
                 className={`search-btn ${searchMode === 'lastName' ? 'active' : ''}`}
               >Last Name</button>
            </div>

            <input 
              type="text" 
              placeholder={searchMode === 'all' ? "Name or RFID..." : `Search ${searchMode === 'firstName' ? 'First' : 'Last'} Name...`} 
              value={filterText} 
              onChange={(e) => handleFilterChange(setFilterText, e.target.value)} 
              className="mt-2"
            />
        </div>
        
        <div className="filter-group"><label>Filter Date</label><div className="date-input-wrapper"><button onClick={setToday} className="btn-small">Today</button><input type="date" value={filterDate} onChange={(e) => handleFilterChange(setFilterDate, e.target.value)} /></div></div>
        
        <div className="filter-group">
          <label>Time (12h)</label>
          <div className="time-select-wrapper">
            <select value={selHour} onChange={e => handleFilterChange(setSelHour, e.target.value)}><option value="">Hr</option>{Array.from({length: 12}, (_, i) => <option key={i+1} value={(i+1).toString().padStart(2,'0')}>{(i+1).toString().padStart(2,'0')}</option>)}</select>
            <select value={selMin} onChange={e => handleFilterChange(setSelMin, e.target.value)}><option value="">Min</option>{[0,5,10,15,20,25,30,35,40,45,50,55].map(m => <option key={m} value={m.toString().padStart(2,'0')}>{m.toString().padStart(2,'0')}</option>)}</select>
            <select value={selAmPm} onChange={e => handleFilterChange(setSelAmPm, e.target.value)}><option value="">--</option><option value="AM">AM</option><option value="PM">PM</option></select>
          </div>
        </div>
        <div className="filter-group" style={{ maxWidth: "150px" }}>
          <label>Sort Results</label>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="w-full p-2 border rounded"><option value="newest">Time (Newest)</option><option value="oldest">Time (Oldest)</option><option value="name_asc">Name (A-Z)</option><option value="name_desc">Name (Z-A)</option></select>
        </div>
        <div className="filter-actions"><button onClick={clearFilters} className="btn-reset">Reset Filter</button></div>
      </div>

      <div className="table-container">
        <table>
          <thead><tr><th>Date</th><th>Time</th><th>Student Name</th><th>Status</th></tr></thead>
          <tbody>
            {currentItems.length > 0 ? currentItems.map((log) => {
              const student = students[log.rfid];
              
              // Dynamic Name Display
              const displayName = getFormattedName(student, searchMode);
              
              // Check if valid info exists in DB
              const hasValidInfo = student && student.firstName && student.lastName;

              return (
                <tr key={log.id}>
                  <td>{log.date}</td>
                  <td><span className="time-badge">{log.displayTime}</span></td>
                  <td>
                    {hasValidInfo ? (
                        <div className="user-info registered"><span className="name">{displayName}</span><span className="rfid">{log.rfid}</span></div>
                    ) : (
                        <div className="user-info unknown"><span className="name">Unregistered</span><span className="rfid">{log.rfid}</span></div>
                    )}
                  </td>
                  <td>
                    <span className={`status-pill ${hasValidInfo ? "status-success" : "status-error"}`}>
                        {hasValidInfo ? "Present" : "Missing Info"}
                    </span>
                  </td>
                </tr>
              );
            }) : <tr><td colSpan="4" className="empty-state">No logs found.</td></tr>}
          </tbody>
        </table>
        {sortedDashboardLogs.length > itemsPerPage && (
          <div className="pagination-controls">
            <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="page-btn">Previous</button>
            <span className="page-info">Page <b>{currentPage}</b> of <b>{totalPages}</b></span>
            <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="page-btn">Next</button>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Select Data to Export</h2>
              <button onClick={() => setIsModalOpen(false)} className="close-btn">×</button>
            </div>
            
            <div className="modal-section" ref={dateWrapperRef}>
                <p className="modal-subtitle">1. Select Dates</p>
                <div className="custom-dropdown-container">
                  <input 
                    type="text" 
                    placeholder={selectedExportDates.length > 0 ? `${selectedExportDates.length} dates selected` : "Search and Select Dates..."} 
                    value={dateSearchText}
                    onChange={(e) => setDateSearchText(e.target.value)}
                    onFocus={() => setShowDateDropdown(true)}
                    className="modal-search"
                  />
                  {showDateDropdown && (
                    <div className="custom-dropdown-list">
                      {filteredDateList.length > 0 ? filteredDateList.map(dateStr => (
                        <label key={dateStr} className="dropdown-item">
                          <input type="checkbox" checked={selectedExportDates.includes(dateStr)} onChange={() => toggleDateSelection(dateStr)} />
                          <span>{formatDateLabel(dateStr)}</span>
                        </label>
                      )) : <div className="dropdown-empty">No dates found</div>}
                    </div>
                  )}
                </div>
            </div>

            <div className="modal-section" ref={nameWrapperRef}>
                <p className="modal-subtitle">2. Filter by Name (Optional)</p>
                <div className="custom-dropdown-container">
                  <input 
                    type="text" 
                    placeholder="Type name (e.g. Cruz)..." 
                    value={exportNameSearch}
                    onChange={handleNameInputChange}
                    onFocus={() => setShowNameDropdown(true)}
                    className="modal-search"
                  />
                  {showNameDropdown && exportNameSearch && (
                    <div className="custom-dropdown-list">
                      {filteredStudentsList.length > 0 ? filteredStudentsList.map(s => (
                        <div key={s.rfid} className="dropdown-item clickable" onClick={() => handleNameSelect(s)}>
                          <span className="font-bold">{s.name}</span>
                          <span className="text-gray-400 text-xs ml-2">({s.rfid})</span>
                        </div>
                      )) : <div className="dropdown-empty">No students found</div>}
                    </div>
                  )}
                </div>
            </div>

            <div className="modal-section time-range-section">
                <div className="flex items-center gap-3 mb-3" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                   <p className="modal-subtitle" style={{ margin: 0 }}>3. Filter by Specific Time?</p>
                   <div 
                     className={`toggle-switch ${isTimeFilterEnabled ? 'active' : ''}`} 
                     onClick={() => setIsTimeFilterEnabled(!isTimeFilterEnabled)}
                   >
                     <div className="toggle-knob">
                       {isTimeFilterEnabled ? '✓' : '✕'}
                     </div>
                   </div>
                </div>

                {isTimeFilterEnabled ? (
                  <div className="time-range-row">
                      <div className="time-col">
                          <label>From:</label>
                          <div className="stepper-group">
                             <TimeStepper value={expStartHour} options={hoursArr} onChange={setExpStartHour} />
                             <span className="colon">:</span>
                             <TimeStepper value={expStartMin} options={minsArr} onChange={setExpStartMin} />
                             <TimeStepper value={expStartAmPm} options={ampmArr} onChange={setExpStartAmPm} type="ampm" />
                          </div>
                      </div>
                      <div className="time-col">
                          <label>To:</label>
                          <div className="stepper-group">
                             <TimeStepper value={expEndHour} options={hoursArr} onChange={setExpEndHour} />
                             <span className="colon">:</span>
                             <TimeStepper value={expEndMin} options={minsArr} onChange={setExpEndMin} />
                             <TimeStepper value={expEndAmPm} options={ampmArr} onChange={setExpEndAmPm} type="ampm" />
                          </div>
                      </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic" style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                    Downloads data for the entire day (All Hours).
                  </p>
                )}
            </div>

            {exportError && <div className="error-display">⚠️ {exportError}</div>}

            <div className="modal-actions">
              <button onClick={() => handleExport('excel')} className="btn-export excel">Download Excel</button>
              <button onClick={() => handleExport('csv')} className="btn-export csv">Download CSV</button>
              <button onClick={() => handleExport('pdf')} className="btn-export pdf">Download PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;