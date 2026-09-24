import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import Shell from './components/Shell'
import NewScan from './pages/NewScan'
import LiveScan from './pages/LiveScan'
import Results from './pages/Results'
import FindingDetail from './pages/FindingDetail'
import AccessMatrix from './pages/AccessMatrix'
import Report from './pages/Report'
import './index.css'

const router = createBrowserRouter([
  {
    path: '/', element: <Shell />, children: [
      { index: true, element: <Navigate to="/scan/new" replace /> },
      { path: 'scan/new', element: <NewScan /> },
      { path: 'scan/:scanId/live', element: <LiveScan /> },
      { path: 'scan/:scanId/results', element: <Results /> },
      { path: 'scan/:scanId/matrix', element: <AccessMatrix /> },
      { path: 'scan/:scanId/report', element: <Report /> },
      { path: 'finding/:findingId', element: <FindingDetail /> },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><RouterProvider router={router} /></React.StrictMode>,
)
