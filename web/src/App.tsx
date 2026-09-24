import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import NewScan from './pages/NewScan'
import LiveScan from './pages/LiveScan'
import Results from './pages/Results'
import FindingDetail from './pages/FindingDetail'
import { Card } from './components/ui'

const Soon = ({ name }: { name: string }) => <Card className="p-8 text-dim">{name} page is not built yet.</Card>

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/scan/new" replace />} />
        <Route path="/scan/new" element={<NewScan />} />
        <Route path="/scan/:scanId/live" element={<LiveScan />} />
        <Route path="/scan/:scanId/results" element={<Results />} />
        <Route path="/scan/:scanId/matrix" element={<Soon name="Access Matrix" />} />
        <Route path="/scan/:scanId/report" element={<Soon name="Report" />} />
        <Route path="/finding/:findingId" element={<FindingDetail />} />
      </Route>
    </Routes>
  )
}
