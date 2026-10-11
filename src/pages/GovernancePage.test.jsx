import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GovernancePage from './GovernancePage'

const mockAppContext = {
  orgs: [],
  model: null,
  issuesData: {},
  staleRepoStats: [],
  runAudit: vi.fn(),
  govLoading: false,
  auditComplete: false,
  loading: false,
  runGovernanceAnalysis: vi.fn(),
}

vi.mock('../context/AppContext', () => ({
  useApp: () => mockAppContext,
}))

describe('GovernancePage Organization Filter', () => {
  const oneHundredDaysAgo = new Date(Date.now() - 100 * 86_400_000).toISOString()
  const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString()

  beforeEach(() => {
    mockAppContext.orgs = [
      { login: 'OrgA' },
      { login: 'OrgB' },
    ]
    mockAppContext.model = {
      allRepos: [
        { id: 1, name: 'repo-a1', orgLogin: 'OrgA', license: null, archived: false, fork: false },
        { id: 2, name: 'repo-a2', orgLogin: 'OrgA', license: { spdx_id: 'MIT' }, archived: false, fork: false },
        { id: 3, name: 'repo-b1', orgLogin: 'OrgB', license: null, archived: false, fork: false },
      ],
      totalRepos: [],
    }
    mockAppContext.issuesData = {
      'OrgA/repo-a1': [
        { id: 101, number: 1, title: 'Dead Issue in OrgA', state: 'open', created_at: oneHundredDaysAgo, user: { login: 'user1' }, pull_request: false },
        { id: 102, number: 2, title: 'Zombie PR in OrgA', state: 'open', created_at: oneHundredDaysAgo, user: { login: 'user2' }, pull_request: true },
        { id: 103, number: 3, title: 'Recent Issue in OrgA', state: 'open', created_at: tenDaysAgo, user: { login: 'user3' }, pull_request: false },
      ],
      'OrgB/repo-b1': [
        { id: 201, number: 10, title: 'Dead Issue in OrgB', state: 'open', created_at: oneHundredDaysAgo, user: { login: 'user4' }, pull_request: false },
        { id: 202, number: 11, title: 'Zombie PR in OrgB', state: 'open', created_at: oneHundredDaysAgo, user: { login: 'user5' }, pull_request: true },
      ],
    }
    mockAppContext.staleRepoStats = [
      { id: 'OrgA/repo-a1', org: 'OrgA', repo: 'repo-a1', ratio: 50, staleCount: 1, openCount: 2 },
      { id: 'OrgB/repo-b1', org: 'OrgB', repo: 'repo-b1', ratio: 100, staleCount: 1, openCount: 1 },
    ]
    mockAppContext.loading = false
    mockAppContext.govLoading = false
  })

  it('renders the organization selector with All Organizations and each organization option', () => {
    render(<GovernancePage />)

    const select = screen.getByRole('combobox', { name: /filter governance by organization/i })
    expect(select).toBeInTheDocument()
    expect(select).toHaveValue('All Organizations')

    const options = screen.getAllByRole('option')
    expect(options.map(o => o.textContent)).toEqual(['All Organizations', 'OrgA', 'OrgB'])
  })

  it('shows all records across organizations by default when All Organizations is selected', () => {
    render(<GovernancePage />)

    // Dead issues tab is open by default
    expect(screen.getByText('Dead Issue in OrgA')).toBeInTheDocument()
    expect(screen.getByText('Dead Issue in OrgB')).toBeInTheDocument()
  })

  it('filters dead issues and zombie PRs when an organization is selected', async () => {
    render(<GovernancePage />)
    const user = userEvent.setup()

    const select = screen.getByRole('combobox', { name: /filter governance by organization/i })
    await user.selectOptions(select, 'OrgA')

    // Dead issues tab: only OrgA
    expect(screen.getByText('Dead Issue in OrgA')).toBeInTheDocument()
    expect(screen.queryByText('Dead Issue in OrgB')).not.toBeInTheDocument()

    // Switch to Zombie PRs tab
    await user.click(screen.getByRole('button', { name: /zombie prs/i }))
    expect(screen.getByText('Zombie PR in OrgA')).toBeInTheDocument()
    expect(screen.queryByText('Zombie PR in OrgB')).not.toBeInTheDocument()

    // Switch org to OrgB
    await user.selectOptions(select, 'OrgB')
    expect(screen.getByText('Zombie PR in OrgB')).toBeInTheDocument()
    expect(screen.queryByText('Zombie PR in OrgA')).not.toBeInTheDocument()
  })

  it('preserves the selected organization filter when switching between governance tabs', async () => {
    render(<GovernancePage />)
    const user = userEvent.setup()

    const select = screen.getByRole('combobox', { name: /filter governance by organization/i })
    await user.selectOptions(select, 'OrgB')

    // Switch to No License tab
    await user.click(screen.getByRole('button', { name: /no license/i }))
    expect(select).toHaveValue('OrgB')
    expect(screen.getAllByText('repo-b1').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('repo-a1')).not.toBeInTheDocument()

    // Switch to Stale Issues Ratio tab
    await user.click(screen.getByRole('button', { name: /stale issues ratio/i }))
    expect(select).toHaveValue('OrgB')
    expect(screen.getAllByText('repo-b1').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('repo-a1')).not.toBeInTheDocument()
  })

  it('restores all records when All Organizations is re-selected', async () => {
    render(<GovernancePage />)
    const user = userEvent.setup()

    const select = screen.getByRole('combobox', { name: /filter governance by organization/i })
    await user.selectOptions(select, 'OrgA')
    expect(screen.queryByText('Dead Issue in OrgB')).not.toBeInTheDocument()

    await user.selectOptions(select, 'All Organizations')
    expect(screen.getByText('Dead Issue in OrgA')).toBeInTheDocument()
    expect(screen.getByText('Dead Issue in OrgB')).toBeInTheDocument()
  })

  it('displays empty state when the selected organization has no matching records', async () => {
    // OrgB has no repositories without a license
    mockAppContext.model.allRepos = [
      { id: 1, name: 'repo-a1', orgLogin: 'OrgA', license: null, archived: false, fork: false },
      { id: 3, name: 'repo-b1', orgLogin: 'OrgB', license: { spdx_id: 'MIT' }, archived: false, fork: false },
    ]

    render(<GovernancePage />)
    const user = userEvent.setup()

    const select = screen.getByRole('combobox', { name: /filter governance by organization/i })
    await user.selectOptions(select, 'OrgB')

    await user.click(screen.getByRole('button', { name: /no license/i }))
    expect(screen.getByText('All repos have licenses')).toBeInTheDocument()
  })

  it('safely handles missing organization metadata without assigning to an incorrect organization', async () => {
    mockAppContext.issuesData = {
      'unknown-format-key': [
        { id: 999, number: 99, title: 'Orphan Issue', state: 'open', created_at: oneHundredDaysAgo, user: { login: 'user' }, pull_request: false },
      ],
      'OrgA/repo-a1': [
        { id: 101, number: 1, title: 'OrgA Issue', state: 'open', created_at: oneHundredDaysAgo, user: { login: 'user1' }, pull_request: false },
      ],
    }

    render(<GovernancePage />)
    const user = userEvent.setup()

    const select = screen.getByRole('combobox', { name: /filter governance by organization/i })
    await user.selectOptions(select, 'OrgA')

    // OrgA Issue is shown, Orphan Issue with missing orgName is not assigned to OrgA
    expect(screen.getByText('OrgA Issue')).toBeInTheDocument()
    expect(screen.queryByText('Orphan Issue')).not.toBeInTheDocument()
  })

  it('does not display selector in single organization mode', () => {
    mockAppContext.orgs = [{ login: 'SingleOrg' }]
    mockAppContext.model.allRepos = [{ id: 1, name: 'repo1', orgLogin: 'SingleOrg', license: null }]
    mockAppContext.issuesData = { 'SingleOrg/repo1': [] }

    render(<GovernancePage />)

    expect(screen.queryByRole('combobox', { name: /filter governance by organization/i })).not.toBeInTheDocument()
  })
})
