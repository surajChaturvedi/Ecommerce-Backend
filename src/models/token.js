'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class tokens extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      tokens.belongsTo(models.users, { foreignKey: "user_id" });
    }
  }
  tokens.init({
    user_id: DataTypes.INTEGER,
    token: DataTypes.STRING,
    token_type: DataTypes.STRING,
    expires_at: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'token',
    paranoid: true,
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  });
  return tokens;
};