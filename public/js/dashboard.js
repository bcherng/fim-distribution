document.getElementById('goBtn').addEventListener('click', () => {
  const machineId = document.getElementById('machineId').value.trim();
  if (machineId) {
    window.location.href = `/machine/${machineId}`;
  } else {
    alert('Please enter a machine ID');
  }
});
