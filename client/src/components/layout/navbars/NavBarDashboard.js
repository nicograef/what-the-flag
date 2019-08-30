// React and Redux
import React, { useState, useEffect } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Material UI
import { AppBar, Toolbar, Typography, Chip, Link } from '@material-ui/core'

const NavBarDashboard = ({ user, pointsDifference }) => {
  const [points, setPoints] = useState(user.points - pointsDifference)

  useEffect(() => {
    function countPointsUp() {
      setPoints(points => {
        if (points === user.points) clearInterval(interval)
        return Math.min(points + 1, user.points)
      })
    }
    const interval = setInterval(countPointsUp, 100)
    return () => clearInterval(interval)
  }, [user.points])

  return (
    <AppBar position='static'>
      <Toolbar>
        <Typography variant='h6' style={{ flexGrow: 1 }}>
          <Link component={RouterLink} color='inherit' to='/profile'>
            {user.emoji}
            {user.username}
          </Link>
        </Typography>
        <Link component={RouterLink} color='inherit' to='/leaderboard'>
          <Chip color='secondary' size='small' label={`${points} Points`} />
        </Link>
      </Toolbar>
    </AppBar>
  )
}

NavBarDashboard.propTypes = {
  user: PropTypes.object,
  pointsDifference: PropTypes.number.isRequired
}

const mapStateToProps = state => ({
  user: state.auth.user,
  pointsDifference: state.auth.pointsDifference
})

export default connect(mapStateToProps)(NavBarDashboard)
