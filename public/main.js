// Search
function search() {
    event.preventDefault();
    var searchBar = document.getElementById("searchBar");
    var searchBarInput = document.getElementById("searchBarInput");
    if (event.key == "Enter") {
        searchBar.setAttribute("action", searchBar.getAttribute('action') + searchBarInput.value.replace(" ", ""));
        searchBar.submit();
    } else {
        searchBarInput.value = searchBarInput.value + event.key;
    };
};
function searchButton() {
    event.preventDefault();
    var searchBar = document.getElementById("searchBar");
    var searchBarInput = document.getElementById("searchBarInput");
    searchBar.setAttribute("action", searchBar.getAttribute('action') + searchBarInput.value.replace(" ", ""));
    searchBar.submit();
};

// Header/Sidebar
var offcanvasElementList = [].slice.call(document.querySelectorAll('.offcanvas'));
var offcanvasList = offcanvasElementList.map(function (offcanvasEl) {
  return new bootstrap.Offcanvas(offcanvasEl);
});

window.addEventListener('resize', function(event) {
    if (window.innerWidth < 1000){
        toggle("pc-header", "none");
        toggle("mobile-header", "initial");
        mainContent.style.marginLeft = "5%";
    } else {
        toggle("mobile-header", "none");
        toggle("pc-header", "initial");
        mainContent.style.marginLeft = "15%";
    };
});