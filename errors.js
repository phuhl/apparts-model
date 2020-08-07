function NotUnique() {
  this.message = `[Model] Object not unique`;
  this.toString = () => this.message;
}
function NotFound() {
  this.message = `[Model] Object not found`;
  this.toString = () => this.message;
}
function DoesExist() {
  this.message = `[Model] Object does exist`;
  this.toString = () => this.message;
}

module.exports = {
  NotUnique,
  NotFound,
  DoesExist,
};
