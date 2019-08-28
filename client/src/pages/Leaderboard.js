import React, { Fragment } from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Material UI
import { List, ListItem, ListItemText, ListItemAvatar, Avatar, Chip } from '@material-ui/core'

// Components
import Navbar from '../components/layout/NavBar'

const Profile = ({ users }) => {
  const sortedUsers = users.sort((a, b) => b.points - a.points)

  return (
    <Fragment>
      <Navbar text='Leaderboard' />

      <List style={{ width: '100%', flexGrow: 1 }}>
        {sortedUsers &&
          sortedUsers.map(({ username, emoji, points }, index) => (
            <ListItem key={username}>
              <ListItemAvatar>
                <Avatar style={{ color: 'black', background: 'none' }}>
                  {index === 0 && '🥇'}
                  {index === 1 && '🥈'}
                  {index === 2 && '🥉'}
                  {index > 2 && index}
                </Avatar>
              </ListItemAvatar>
              <ListItemText primary={emoji + username} />
              <Chip color='secondary' size='small' label={`${points} Points`} />
            </ListItem>
          ))}
      </List>
    </Fragment>
  )
}

Profile.propTypes = {
  users: PropTypes.array.isRequired
}

const mapStateToProps = state => ({
  users: state.auth.users
})

export default connect(mapStateToProps)(Profile)
