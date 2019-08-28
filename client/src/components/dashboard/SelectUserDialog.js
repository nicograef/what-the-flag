// React and Redux
import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Actions
import { getUsers } from '../../actions/auth'

// Material UI
import { Dialog, List, ListItem, ListItemText, TextField } from '@material-ui/core'
import Spinner from '../layout/Spinner'

function SelectUserDialog({ open, onClose, onSelect, user, users, getUsers }) {
  const [filter, setFilter] = useState(null)

  useEffect(() => {
    if (!users) getUsers()
  }, [getUsers, users])

  const onFilterChange = e => {
    e.target.value = e.target.value.trim()
    setFilter(new RegExp(e.target.value, 'ig'))
  }

  return (
    <Dialog onClose={onClose} open={open}>
      {/* <DialogTitle>Select a Friend</DialogTitle> */}
      <TextField
        variant='filled'
        name='search'
        type='text'
        placeholder='search user'
        onChange={onFilterChange}
      />
      {!users && <Spinner />}
      <List>
        {users &&
          users.map(
            ({ username, emoji }) =>
              username !== user.username &&
              (filter ? username.match(filter) : true) && (
                <ListItem button onClick={() => onSelect(username)} key={username}>
                  <ListItemText primary={emoji + username} />
                </ListItem>
              )
          )}
      </List>
    </Dialog>
  )
}

SelectUserDialog.propTypes = {
  onSelect: PropTypes.func.isRequired,
  open: PropTypes.bool.isRequired,
  user: PropTypes.object,
  users: PropTypes.array,
  getUsers: PropTypes.func.isRequired
}

const mapStateToProps = state => ({
  user: state.auth.user,
  users: state.auth.users
})

export default connect(
  mapStateToProps,
  { getUsers }
)(SelectUserDialog)
